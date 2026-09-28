/**
 * M2 REGRESSION TEST — seed rotation must not break fairness verification.
 *
 * Bug being guarded against: rotateSeed() used to discard the outgoing seed,
 * so revealRound() could only return null for any round committed under a
 * previous seed — those rounds became permanently unverifiable, breaking the
 * commit/reveal guarantee for every round after rotation #1.
 *
 * The fix archives each rotated-out seed (keyed by its commit hash). revealRound()
 * then serves old rounds from the archive — but only after verifying the archived
 * seed actually hashes to the committed hash, so a tampered archive fails safe.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import {
  fairnessService,
  sha256,
} from '../game/fairness';

// Direct re-derivation for an independent cross-check of the recorded crash point.
const deriveCrashPointSafe = (seed: string, roundNumber: number) =>
  fairnessService.deriveCrashPoint(seed, roundNumber);

// Unique roundNumber base so fixtures never collide with live rounds or
// parallel test files (roundNumber is globally unique).
const BASE = 900_000 + Math.floor(Math.random() * 90_000);

const createdRoundIds: string[] = [];
// Per-run unique tamper value — a fixed value would collide with the unique
// `seed` constraint if a previous run's tampered row was left behind.
const TAMPER_SEED = 'tampered-' + crypto.randomBytes(16).toString('hex');

beforeAll(async () => {
  // Repair archive rows left tampered by any earlier failed run.
  await prisma.serverSeedArchive.deleteMany({ where: { seed: TAMPER_SEED } });
  await prisma.serverSeedArchive.deleteMany({ where: { seed: 'deadbeef'.repeat(8) } });
});

afterAll(async () => {
  // Remove fixtures (archive rows are real service output — leave the valid
  // ones; they are seed records, not test garbage). Remove the tampered row.
  if (createdRoundIds.length > 0) {
    await prisma.gameRound.deleteMany({ where: { id: { in: createdRoundIds } } });
  }
  await prisma.serverSeedArchive.deleteMany({ where: { seed: TAMPER_SEED } });
  await prisma.$disconnect();
});

/** Poll until the fire-and-forget archive write lands (max ~3 s). */
async function waitForArchive(seedHash: string) {
  for (let i = 0; i < 30; i++) {
    const row = await prisma.serverSeedArchive.findUnique({ where: { seedHash } });
    if (row) return row;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

describe('M2 — seed rotation keeps old rounds verifiable', () => {
  // Captured by test 1 (tests in a file run in order) and reused by the
  // tamper test: hashA is the only seed we know is archived.
  let hashA = '';

  it('archives the outgoing seed on rotation and reveals old rounds from it', async () => {
    // 1. Commit round A under the currently active seed.
    const roundNumberA = BASE + 1;
    const roundA = await prisma.gameRound.create({
      data: { roundNumber: roundNumberA, phase: 'SETTLED', crashPoint: 1 },
    });
    createdRoundIds.push(roundA.id);

    const commitA = await fairnessService.beginRound(roundNumberA);
    hashA = commitA.serverSeedHash;
    expect(hashA).toBeTruthy();
    // Persist the actually-derived outcome on the round row (what the
    // GameEngine does in production) so verification recomputes against it.
    await prisma.gameRound.update({
      where: { id: roundA.id },
      data: { crashPoint: commitA.crashPoint },
    });

    // 2. Force a rotation: mark the seed quota exhausted, then begin one more
    //    round — beginRound rotates, archiving the outgoing seed.
    (fairnessService as unknown as { roundsUsed: number }).roundsUsed = 1000;
    const roundNumberB = BASE + 2;
    const roundB = await prisma.gameRound.create({
      data: { roundNumber: roundNumberB, phase: 'SETTLED', crashPoint: 1.8 },
    });
    createdRoundIds.push(roundB.id);
    const commitB = await fairnessService.beginRound(roundNumberB);

    // The new commit must differ — the seed really rotated.
    expect(commitB.serverSeedHash).not.toBe(hashA);

    // 3. The outgoing seed is archived under its commit hash.
    const archived = await waitForArchive(hashA);
    expect(archived).not.toBeNull();
    expect(sha256(archived!.seed)).toBe(hashA); // archive entry is internally consistent

    // 4. Round A — committed BEFORE rotation — can still be revealed afterwards.
    const revealedSeed = await fairnessService.revealRound(roundA.id);
    expect(revealedSeed).toBe(archived!.seed);

    // 5. And it verifies: hash matches the commit, crash point recomputes.
    const storedA = await prisma.gameRound.findUnique({ where: { id: roundA.id } });
    const verdict = fairnessService.verifyRound({
      roundNumber: storedA!.roundNumber,
      crashPoint: storedA!.crashPoint,
      serverSeed: storedA!.serverSeed,
      serverSeedHash: storedA!.serverSeedHash,
    });
    expect(verdict.valid).toBe(true);
    expect(verdict.detail).toBe('Verified');
    expect(verdict.serverSeed).toBe(revealedSeed);
    // Recorded crash point equals the one derived from the revealed seed.
    expect(storedA!.crashPoint!.toNumber()).toBe(commitA.crashPoint);
    expect(commitA.crashPoint).toBe(deriveCrashPointSafe(revealedSeed!, roundNumberA));
  });

  it('refuses to reveal when the archive entry is tampered (fails safe)', async () => {
    // Depends on test 1 having archived seed A under hashA.
    expect(hashA).toBeTruthy();
    const roundNumberC = BASE + 3;
    const roundC = await prisma.gameRound.create({
      data: {
        roundNumber: roundNumberC,
        phase: 'SETTLED',
        crashPoint: 2.5,
        serverSeedHash: hashA, // committed under the OLD (archived) seed
      },
    });
    createdRoundIds.push(roundC.id);

    // Tamper: corrupt the archived seed so it no longer hashes to the commit.
    await prisma.serverSeedArchive.update({
      where: { seedHash: hashA },
      data: { seed: TAMPER_SEED },
    });

    // Reveal must refuse — an unverified archive entry is never trusted.
    const revealed = await fairnessService.revealRound(roundC.id);
    expect(revealed).toBeNull();

    // The round row must not have been marked revealed either.
    const stored = await prisma.gameRound.findUnique({ where: { id: roundC.id } });
    expect(stored!.serverSeed).toBeNull();
  });
});
