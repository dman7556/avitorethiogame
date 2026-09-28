/**
 * FIX 1 REGRESSION TEST — Authoritative bet/wallet resync on reconnect.
 *
 * Bug A: a bet is placed server-side but its ack is lost (disconnect).
 *   The client must learn on reconnect that the bet EXISTS (payload must
 *   include the live row) — it must never silently allow a "retry" that
 *   the DB would reject (and never show an empty slot for money spent).
 *
 * Bug B: a bet settles (cashout win or loss) while the client is
 *   disconnected. The client must learn the SETTLED state and the
 *   CORRECT balance on reconnect — not keep showing "still flying".
 *
 * The sync payload must be built from DB truth only (no client state),
 * include live rows regardless of age/round (QUEUED especially), and
 * include terminal rows only for the current round when fresh (so old
 * history is not resurrected into the live bet UI).
 *
 * Run with: npx vitest run src/__tests__/bet-sync.test.ts
 */
import { describe, it, expect } from 'vitest';
import prisma from '../lib/prisma';
import {
  BetSyncService,
  SYNC_RECENT_WINDOW_MS,
} from '../services/bet-sync.service';
import { GamePhase, BetStatus } from '../shared/types';

const TEST_PREFIX = 'sync1-';

async function createRound(phase: GamePhase = GamePhase.FLYING) {
  return prisma.gameRound.create({
    data: {
      roundNumber: 970_000 + Math.floor(Math.random() * 9_000),
      phase,
      crashPoint: 10.0,
      startedAt: new Date(Date.now() - 5_000),
    },
  });
}

async function createUser(balance: number, withWallet = true) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.user.create({
    data: {
      name: `${TEST_PREFIX}user`,
      email: `${TEST_PREFIX}${suffix}@example.com`,
      phone: `+2519${Math.floor(1000000 + Math.random() * 8999999)}`,
      password: 'x-not-a-real-login',
      ...(withWallet
        ? { wallet: { create: { balance, reserved: 0 } } }
        : {}),
    },
    include: { wallet: true },
  });
}

function makeService(currentRoundId: string | null) {
  return new BetSyncService(prisma, () => currentRoundId);
}

describe('Fix 1: bet-sync service (authoritative reconnect payload)', () => {
  it('Bug A: a placed bet whose ack was lost is included with its round/amount', async () => {
    const user = await createUser(100);
    const round = await createRound();
    const bet = await prisma.bet.create({
      data: {
        userId: user.id,
        roundId: round.id,
        slot: 1,
        amount: 10,
        status: BetStatus.PLACED,
        placedAt: new Date(),
      },
    });

    const payload = await makeService(round.id).getSyncPayload(user.id);

    expect(payload.roundId).toBe(round.id);
    const synced = payload.bets.find((b) => b.id === bet.id);
    expect(synced).toBeDefined();
    expect(synced!.status).toBe('PLACED');
    expect(synced!.amount).toBe('10');
    expect(synced!.roundId).toBe(round.id);
    expect(synced!.slot).toBe(1);
    // Balance is DB truth, not client-optimistic state.
    expect(payload.balance).toBe(100);
  });

  it('Bug B (win): a CASHED_OUT settlement missed while disconnected syncs with payout', async () => {
    const user = await createUser(158); // 100 start + 50 win - debit already applied
    const round = await createRound();
    const bet = await prisma.bet.create({
      data: {
        userId: user.id,
        roundId: round.id,
        slot: 2,
        amount: 10,
        status: BetStatus.CASHED_OUT,
        payout: 50,
        cashoutMultiplier: 5.0,
        placedAt: new Date(),
      },
    });

    const payload = await makeService(round.id).getSyncPayload(user.id);

    const synced = payload.bets.find((b) => b.id === bet.id);
    expect(synced).toBeDefined();
    expect(synced!.status).toBe('CASHED_OUT');
    expect(synced!.payout).toBe('50');
    expect(synced!.cashoutMultiplier).toBe('5');
    expect(payload.balance).toBe(158);
  });

  it('Bug B (loss): a LOST settlement from the current round syncs so the slot clears', async () => {
    const user = await createUser(90); // 100 - 10 lost
    const round = await createRound();
    const bet = await prisma.bet.create({
      data: {
        userId: user.id,
        roundId: round.id,
        slot: 1,
        amount: 10,
        status: BetStatus.LOST,
        placedAt: new Date(),
      },
    });

    const payload = await makeService(round.id).getSyncPayload(user.id);

    const synced = payload.bets.find((b) => b.id === bet.id);
    expect(synced).toBeDefined();
    expect(synced!.status).toBe('LOST');
    expect(synced!.payout).toBeNull();
    expect(payload.balance).toBe(90);
  });

  it('old terminal rows from previous rounds are NOT resurrected', async () => {
    const user = await createUser(100);
    const oldRound = await createRound();
    const current = await createRound();
    await prisma.bet.create({
      data: {
        userId: user.id,
        roundId: oldRound.id,
        slot: 1,
        amount: 10,
        status: BetStatus.CASHED_OUT,
        payout: 30,
        placedAt: new Date(Date.now() - 5 * 60_000),
        createdAt: new Date(Date.now() - 5 * 60_000),
      },
    });

    const payload = await makeService(current.id).getSyncPayload(user.id);

    expect(payload.bets).toHaveLength(0);
    expect(payload.roundId).toBe(current.id);
  });

  it('terminal rows from OTHER rounds are excluded even when fresh', async () => {
    const user = await createUser(100);
    const other = await createRound();
    const current = await createRound();
    await prisma.bet.create({
      data: {
        userId: user.id,
        roundId: other.id,
        slot: 1,
        amount: 10,
        status: BetStatus.LOST,
        placedAt: new Date(),
        createdAt: new Date(),
      },
    });

    const payload = await makeService(current.id).getSyncPayload(user.id);

    expect(payload.bets).toHaveLength(0);
  });

  it('QUEUED bets are always included regardless of age or round', async () => {
    const user = await createUser(100);
    const placementRound = await createRound();
    const current = await createRound();
    const queued = await prisma.bet.create({
      data: {
        userId: user.id,
        roundId: placementRound.id,
        slot: 2,
        amount: 5,
        status: BetStatus.QUEUED,
        autoCashout: 2.0,
        placedAt: new Date(Date.now() - SYNC_RECENT_WINDOW_MS - 60_000),
        createdAt: new Date(Date.now() - SYNC_RECENT_WINDOW_MS - 60_000),
      },
    });

    const payload = await makeService(current.id).getSyncPayload(user.id);

    const synced = payload.bets.find((b) => b.id === queued.id);
    expect(synced).toBeDefined();
    expect(synced!.status).toBe('QUEUED');
    expect(synced!.autoCashout).toBe('2');
  });

  it('live rows survive a null current round (engine between rounds)', async () => {
    const user = await createUser(100);
    const round = await createRound();
    const bet = await prisma.bet.create({
      data: {
        userId: user.id,
        roundId: round.id,
        slot: 1,
        amount: 10,
        status: BetStatus.PLACED,
        placedAt: new Date(),
      },
    });

    const payload = await makeService(null).getSyncPayload(user.id);

    expect(payload.roundId).toBeNull();
    expect(payload.bets.map((b) => b.id)).toContain(bet.id);
  });

  it('balance is null-safe when the user has no wallet row', async () => {
    const user = await createUser(0, false);
    const payload = await makeService(null).getSyncPayload(user.id);
    expect(payload.balance).toBeNull();
    expect(payload.bets).toHaveLength(0);
  });
});
