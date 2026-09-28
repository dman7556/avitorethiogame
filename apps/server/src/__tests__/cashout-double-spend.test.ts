/**
 * C1 REGRESSION TEST — Cashout double-spend must be impossible.
 *
 * Bug being guarded against: processCashout() used to check bet.status
 * OUTSIDE the transaction and settle with a blind update inside it, so two
 * concurrent cashout calls for the same bet could BOTH pass the pre-check
 * and BOTH credit the wallet (money created from nothing).
 *
 * The fix settles via a guarded conditional updateMany
 * (status IN (PLACED, ACTIVE)) inside the transaction: the first caller
 * matches 1 row and wins; the second matches 0 rows and the whole
 * transaction rolls back with ALREADY_SETTLED.
 *
 * Asserts, against the real SQLite database:
 *   1. Exactly ONE of two simultaneous processCashout() calls succeeds.
 *   2. The loser fails with code 'ALREADY_SETTLED' (or a legitimate
 *      settlement-race code, but never succeeds).
 *   3. The wallet was credited EXACTLY ONCE (payout amount, not 2x).
 *   4. The ledger has exactly one WIN row for the bet.
 *
 * Run with: npx vitest run src/__tests__/cashout-double-spend.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../lib/prisma';
import { betManager } from '../game/BetManager';
import { GamePhase, BetStatus } from '../../shared/types';

const TEST_PREFIX = 'c1-test-';

async function createFixture(betAmount: number) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // 900M range: far above the live game's round numbers (~1M), so fixture
  // rounds can never collide with real ones (or with each other, via suffix).
  const roundNumber = 900_000_000 + Math.floor(Math.random() * 9_000);
  const user = await prisma.user.create({
    data: {
      name: `${TEST_PREFIX}user`,
      email: `${TEST_PREFIX}${suffix}@example.com`,
      phone: `+2519${Math.floor(1000000 + Math.random() * 8999999)}`,
      password: 'x-not-a-real-login',
      wallet: { create: { balance: betAmount, reserved: 0 } },
    },
    include: { wallet: true },
  });
  const round = await prisma.gameRound.create({
    data: {
      roundNumber,
      phase: GamePhase.FLYING,
      crashPoint: 10.0,
      startedAt: new Date(Date.now() - 5_000), // 5s flight → multiplier ≈ 1.28
    },
  });
  const bet = await prisma.bet.create({
    data: {
      userId: user.id,
      roundId: round.id,
      slot: 1,
      amount: betAmount,
      status: BetStatus.ACTIVE,
      placedAt: new Date(),
    },
  });
  return { user, round, bet };
}

async function cleanup(user: { id: string }, roundId: string, betId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  if (wallet) {
    await prisma.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
  }
  await prisma.bet.deleteMany({ where: { id: betId } });
  await prisma.gameRound.deleteMany({ where: { id: roundId } });
  await prisma.wallet.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('C1 — concurrent cashout double-spend', () => {
  it('pays exactly once when two cashouts race on the same bet', async () => {
    const AMOUNT = 10;
    const { user, round, bet } = await createFixture(AMOUNT);

    try {
      const walletBefore = await prisma.wallet.findUniqueOrThrow({
        where: { userId: user.id },
      });
      const balanceBefore = Number(walletBefore.balance);

      // Two simultaneous cashout attempts for the SAME bet — the exact
      // double-spend scenario (double-click / two tabs / reconnect replay).
      const [r1, r2] = await Promise.allSettled([
        betManager.processCashout(user.id, bet.id, 1.28),
        betManager.processCashout(user.id, bet.id, 1.28),
      ]);

      const fulfilled = [r1, r2].filter(
        (r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled'
      );
      const rejected = [r1, r2].filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      );

      // 1. Exactly one succeeded.
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // 2. The loser must be a settlement-race rejection, not a crash.
      const reason = (rejected[0].reason as any)?.code ?? '';
      expect(['ALREADY_SETTLED', 'ROUND_NOT_FLYING', 'INVALID_BET_STATE']).toContain(reason);

      // 3. Wallet credited EXACTLY ONCE.
      const walletAfter = await prisma.wallet.findUniqueOrThrow({
        where: { userId: user.id },
      });
      const credited = Number(walletAfter.balance) - balanceBefore;
      expect(credited).toBeCloseTo(fulfilled[0].value.payout, 2);
      expect(credited).toBeGreaterThan(0);
      expect(credited).toBeLessThan(AMOUNT * 2); // definitely not double-paid

      // 4. Ledger: exactly one WIN row for this bet; bet settled once.
      const wins = await prisma.walletTransaction.findMany({
        where: { walletId: walletAfter.id, type: 'WIN', referenceId: bet.id },
      });
      expect(wins.length).toBe(1);

      const settledBet = await prisma.bet.findUniqueOrThrow({ where: { id: bet.id } });
      expect(settledBet.status).toBe(BetStatus.CASHED_OUT);
    } finally {
      await cleanup(user, round.id, bet.id);
    }
  });

  it('rejects a sequential second cashout without re-crediting', async () => {
    const AMOUNT = 5;
    const { user, round, bet } = await createFixture(AMOUNT);

    try {
      const walletBefore = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
      const balanceBefore = Number(walletBefore.balance);

      await expect(betManager.processCashout(user.id, bet.id, 1.28)).resolves.toBeTruthy();
      // A sequential second call is rejected by the pre-transaction status
      // check (bet is already CASHED_OUT) — different code than the race
      // window, same outcome: no second payment.
      await expect(betManager.processCashout(user.id, bet.id, 1.28)).rejects.toMatchObject({
        code: 'INVALID_BET_STATE',
      });

      const walletAfter = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
      const credited = Number(walletAfter.balance) - balanceBefore;
      expect(credited).toBeLessThan(AMOUNT * 2); // single credit, never double
    } finally {
      await cleanup(user, round.id, bet.id);
    }
  });

  it('refuses to cash out after the round has crashed (in-transaction phase guard)', async () => {
    const AMOUNT = 5;
    const { user, round, bet } = await createFixture(AMOUNT);

    try {
      // Simulate the round crashing between the pre-checks and settlement:
      // flip the phase first, then attempt the cashout.
      await prisma.gameRound.update({
        where: { id: round.id },
        data: { phase: GamePhase.CRASHED },
      });
      await expect(betManager.processCashout(user.id, bet.id, 1.28)).rejects.toMatchObject({
        code: 'ROUND_NOT_FLYING',
      });

      const walletAfter = await prisma.wallet.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(Number(walletAfter.balance)).toBe(AMOUNT); // untouched
    } finally {
      await cleanup(user, round.id, bet.id);
    }
  });
});
