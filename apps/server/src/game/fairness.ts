import crypto from 'crypto';
import prisma from '../lib/prisma';

/**
 * PROVABLY FAIR crash-point generation (commit/reveal).
 *
 * ── Design ─────────────────────────────────────────────────────────────
 * For each round the server generates a random `serverSeed` and commits to
 * its SHA-256 hash BEFORE betting opens. The crash point is derived as
 *
 *     h = HMAC_SHA256(serverSeed, `${serverSeedHash}:${roundNumber}`)
 *     u = first 52 bits of h as a uniform fraction in [0, 1)
 *     crashPoint = clamp(round2( (1 - houseEdge) / (1 - u) ), 1.01, 10000)
 *
 * Inputs to the outcome: serverSeed (random at round creation) and
 * roundNumber. NOTHING else — no user ids, balances, bet sizes, deposit
 * totals, platform exposure, or prior results ever influence the outcome.
 *
 * The seed is revealed on the round:settled broadcast, and anyone can
 * recompute the crash point from (serverSeed, roundNumber) — verification
 * is done by `verifyRound` below and by the /api/admin/fairness endpoints.
 *
 * Rotation: the active server seed rotates every SERVER_SEED_ROTATION_ROUNDS
 * rounds. Past seeds stay verifiable via round records.
 * ────────────────────────────────────────────────────────────────────────
 */

const SERVER_SEED_ROTATION_ROUNDS = 1000;
const MAX_CRASH = 10000;

export interface RoundFairness {
  serverSeedHash: string;
  serverSeed?: string | null; // undefined = not yet revealed
  roundNumber: number;
  crashPoint: number;
  valid: boolean;
  detail?: string;
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function hmacSha256(key: string, message: string): string {
  return crypto.createHmac('sha256', key).update(message).digest('hex');
}

export class FairnessService {
  private activeSeed: string | null = null;
  private activeSeedHash: string | null = null;
  private roundsUsed = 0;

  /**
   * Generate a fresh server seed and its public hash commit.
   * The outgoing seed is archived (fire-and-forget) so rounds committed
   * under it stay verifiable after rotation (audit M2).
   */
  rotateSeed(): { serverSeed: string; serverSeedHash: string } {
    if (this.activeSeed && this.activeSeedHash) {
      // Archive before overwrite. Never block rotation on the DB write; the
      // archive is re-checked on reveal, so a failed write fails safe (the
      // reveal path refuses rather than revealing something unverified).
      const seed = this.activeSeed;
      const seedHash = this.activeSeedHash;
      void prisma.serverSeedArchive
        .upsert({
          where: { seedHash },
          create: { seedHash, seed },
          update: {}, // exists — nothing to change (seedHash is the archive key)
        })
        .catch((err: unknown) =>
          console.error('[Fairness] seed archive write failed:', err)
        );
    }
    this.activeSeed = crypto.randomBytes(32).toString('hex');
    this.activeSeedHash = sha256(this.activeSeed);
    this.roundsUsed = 0;
    return { serverSeed: this.activeSeed, serverSeedHash: this.activeSeedHash };
  }

  /** Ensure a seed exists; returns { seed, hash }. */
  ensureSeed(): { seed: string; hash: string } {
    if (!this.activeSeed || !this.activeSeedHash) {
      const { serverSeed, serverSeedHash } = this.rotateSeed();
      return { seed: serverSeed, hash: serverSeedHash };
    }
    return { seed: this.activeSeed, hash: this.activeSeedHash };
  }

  /**
   * Derive the crash point from a seed + round number.
   * PURE function of (serverSeed, roundNumber) — nothing else is an input.
   */
  deriveCrashPoint(serverSeed: string, roundNumber: number, houseEdge = 0.03): number {
    const h = hmacSha256(serverSeed, `sky-rush:${roundNumber}`);
    // First 13 hex chars = 52 bits → uniform in [0,1)
    const u = parseInt(h.slice(0, 13), 16) / Math.pow(2, 52);
    const raw = (1 - houseEdge) / (1 - u);
    const clamped = Math.max(1.01, Math.min(MAX_CRASH, raw));
    return Math.round(clamped * 100) / 100;
  }

  /**
   * Generate the outcome for a new round:
   * 1. rotate seed if the current one hit its usage quota
   * 2. derive crash point
   * 3. persist fairness fields on the GameRound (commit made public)
   * Returns { crashPoint, serverSeedHash } — the seed itself stays secret
   * until reveal.
   */
  async beginRound(roundNumber: number, houseEdge = 0.03): Promise<{ crashPoint: number; serverSeedHash: string }> {
    if (this.roundsUsed >= SERVER_SEED_ROTATION_ROUNDS) {
      this.rotateSeed();
    }
    const { seed, hash } = this.ensureSeed();
    this.roundsUsed++;

    const crashPoint = this.deriveCrashPoint(seed, roundNumber, houseEdge);

    // Persist the commit (hash) on the round row. The seed is revealed later.
    await prisma.gameRound.updateMany({
      where: { roundNumber },
      data: { serverSeedHash: hash },
    });

    return { crashPoint, serverSeedHash: hash };
  }

  /**
   * Reveal the server seed for a completed round. Idempotent — once
   * revealed the value is stored and cannot be changed.
   */
  async revealRound(roundId: string): Promise<string | null> {
    const round = await prisma.gameRound.findUnique({
      where: { id: roundId },
      select: { id: true, roundNumber: true, serverSeed: true, serverSeedHash: true },
    });
    if (!round) return null;
    if (round.serverSeed) return round.serverSeed; // already revealed

    // Only reveal a seed whose hash matches what we committed.
    const { seed, hash } = this.ensureSeed();
    if (round.serverSeedHash && round.serverSeedHash !== hash) {
      // Round was created under a previous (rotated-out) seed. Reveal from
      // the archive — but verify the archive entry against the commit hash
      // first: an archived seed is only trustworthy if it hashes to exactly
      // what was published before betting opened (audit M2).
      const archived = await prisma.serverSeedArchive.findUnique({
        where: { seedHash: round.serverSeedHash },
      });
      if (!archived || sha256(archived.seed) !== round.serverSeedHash) {
        // No verified archive entry — stay honest: refuse to reveal.
        return null;
      }
      await prisma.gameRound.update({
        where: { id: roundId },
        data: { serverSeed: archived.seed },
      });
      return archived.seed;
    }
    await prisma.gameRound.update({
      where: { id: roundId },
      data: { serverSeed: seed },
    });
    return seed;
  }

  /**
   * Independent verification: recompute crashPoint from revealed inputs.
   * This is the function authorized verifiers (and the admin UI) use.
   */
  verifyRound(round: {
    roundNumber: number;
    crashPoint: any; // Decimal
    serverSeed?: string | null;
    serverSeedHash?: string | null;
  }): RoundFairness {
    const base: RoundFairness = {
      roundNumber: round.roundNumber,
      serverSeedHash: round.serverSeedHash || null as any,
      crashPoint: Number(round.crashPoint),
      valid: false,
    };

    if (!round.serverSeed) {
      return { ...base, valid: false, detail: 'Seed not yet revealed' };
    }
    if (!round.serverSeedHash) {
      return { ...base, valid: false, detail: 'Missing commit hash' };
    }

    const actualHash = sha256(round.serverSeed);
    if (actualHash !== round.serverSeedHash) {
      return { ...base, valid: false, detail: 'Seed hash mismatch — commit violated' };
    }

    const expected = this.deriveCrashPoint(round.serverSeed, round.roundNumber);
    const actual = Number(round.crashPoint);
    if (Math.abs(expected - actual) > 0.005) {
      return { ...base, valid: false, detail: `Recomputed ${expected} != recorded ${actual}` };
    }

    return { ...base, serverSeed: round.serverSeed, valid: true, detail: 'Verified' };
  }

  /** Public info for the current seed commit (safe to expose to players). */
  getPublicCommit(): { serverSeedHash: string; roundsRemaining: number } {
    const { hash } = this.ensureSeed();
    return {
      serverSeedHash: hash,
      roundsRemaining: Math.max(0, SERVER_SEED_ROTATION_ROUNDS - this.roundsUsed),
    };
  }
}

export const fairnessService = new FairnessService();
