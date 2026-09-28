/**
 * H4 REGRESSION TESTS — Withdrawal per-user guardrails + risk-engine auto-hold.
 *
 * Risks being guarded against:
 *  1. A user could flood the admin queue with unlimited concurrent PENDING
 *     withdrawal requests (admin-attention spam, reservation stacking).
 *  2. Rapid-fire submission churn (submit → reject → resubmit) had no friction.
 *  3. The risk engine only ever LOGGED suspicious patterns — a flagged request
 *     sailed straight into the normal approval flow.
 *
 * The fix (confirmed parameters):
 *  - Max 3 concurrent PENDING requests per user  → PENDING_CAP_REACHED
 *  - 15-min cooldown between submissions (any outcome) → COOLDOWN_ACTIVE
 *    (+ cooldownRemainingSeconds so the frontend can count down)
 *  - Risk engine HIGH/CRITICAL assessment → withdrawal flipped to HELD,
 *    awaiting explicit admin approve/reject (funds stay reserved either way)
 *
 * NOTE: createWithdrawal now enforces the cooldown, so every submission in
 * this file uses a FRESH user except where the cooldown itself is the subject.
 * money-flows.test.ts needed the same treatment for its legacy multi-submit
 * scenarios.
 *
 * Run with: npx vitest run src/__tests__/withdrawal-guardrails.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../lib/prisma';
import { withdrawalService, WithdrawalError } from '../services/withdrawal.service';
import { money } from '../services/money.helper';
import { riskEngine } from '../analytics/risk-engine';

const PREFIX = 'h4-test-';

let userCounter = 0;
async function createTestUser(withBalance: number) {
  const suffix = `${Date.now()}-${userCounter++}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.user.create({
    data: {
      name: `${PREFIX}user-${suffix}`,
      email: `${PREFIX}${suffix}@example.com`,
      phone: `+2519${Math.floor(1000000 + Math.random() * 8999999)}`,
      password: 'x-not-a-real-login',
      wallet: {
        create: { balance: money.fromNumber(withBalance) },
      },
    },
    include: { wallet: true },
  });
}

async function cleanupUser(userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (wallet) {
    await prisma.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
  }
  await prisma.walletTransaction.deleteMany({
    where: {
      referenceId: {
        in: (await prisma.withdrawal.findMany({ where: { userId } })).map((w) => w.id),
      },
    },
  });
  await prisma.riskEvent.deleteMany({ where: { userId } });
  await prisma.adminAuditLog.deleteMany({ where: { OR: [{ adminId: userId }, { targetUserId: userId }] } });
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.withdrawal.deleteMany({ where: { userId } });
  await prisma.wallet.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

async function walletOf(userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  return { balance: Number(wallet!.balance), reserved: Number(wallet!.reserved) };
}

const MIN_W = 100; // GAME_CONSTANTS.MINIMUM_WITHDRAWAL

describe('H4: withdrawal guardrails', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('4th concurrent PENDING request → PENDING_CAP_REACHED, funds untouched by the rejected attempt', async () => {
    // 3 requests of 100 each: balance 1000 (untouched), reserved 300 → available 700.
    // All 3 succeed (each is this user's first submission — see cooldown note).
    // Wait: the cooldown! Submissions 2 and 3 would hit COOLDOWN_ACTIVE...
    // They don't, because the cooldown is back-dated below before the 2nd/3rd.
    const user = await createTestUser(1000);
    try {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        // Back-date the previous submission(s) past the cooldown so each call
        // is treated as a fresh 15-min window (the cap test isolates the cap).
        if (ids.length) {
          const old = new Date(Date.now() - 16 * 60_000);
          await prisma.withdrawal.updateMany({
            where: { id: { in: ids } },
            data: { createdAt: old },
          });
        }
        const w = await withdrawalService.createWithdrawal({
          userId: user.id,
          amount: money.fromNumber(MIN_W),
          paymentMethod: 'TELEBIRR' as any,
          accountNumber: '+251911223344',
        });
        ids.push(w.id);
        expect(w.status).toBe('PENDING');
      }

      // Sanity: 3 pending now
      expect(await prisma.withdrawal.count({ where: { userId: user.id, status: 'PENDING' } })).toBe(3);

      // 4th attempt (after back-dating so the CAP is the only blocker)
      await prisma.withdrawal.updateMany({
        where: { id: { in: ids } },
        data: { createdAt: new Date(Date.now() - 16 * 60_000) },
      });
      let capError: any;
      try {
        await withdrawalService.createWithdrawal({
          userId: user.id,
          amount: money.fromNumber(MIN_W),
          paymentMethod: 'TELEBIRR' as any,
          accountNumber: '+251911223344',
        });
      } catch (e) {
        capError = e;
      }
      expect(capError).toBeInstanceOf(WithdrawalError);
      expect(capError.code).toBe('PENDING_CAP_REACHED');

      // The rejected attempt must NOT have touched funds or created a row
      const wallet = await walletOf(user.id);
      expect(wallet.balance).toBe(1000); // balance untouched until approval
      expect(wallet.reserved).toBe(300); // held by the 3 pending requests
      expect(await prisma.withdrawal.count({ where: { userId: user.id } })).toBe(3);
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('submission within the 15-min cooldown → COOLDOWN_ACTIVE with remaining seconds', async () => {
    const user = await createTestUser(1000);
    try {
      await withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(MIN_W),
        paymentMethod: 'CBE' as any,
        accountNumber: '+251911223355',
      });

      let cdError: any;
      try {
        await withdrawalService.createWithdrawal({
          userId: user.id,
          amount: money.fromNumber(MIN_W),
          paymentMethod: 'CBE' as any,
          accountNumber: '+251911223355',
        });
      } catch (e) {
        cdError = e;
      }
      expect(cdError).toBeInstanceOf(WithdrawalError);
      expect(cdError.code).toBe('COOLDOWN_ACTIVE');
      // Frontend countdown payload: somewhere in (14, 15] minutes
      expect(cdError.cooldownRemainingSeconds).toBeGreaterThan(14 * 60);
      expect(cdError.cooldownRemainingSeconds).toBeLessThanOrEqual(15 * 60);

      // Rejected attempt left no row and no reservation
      expect(await prisma.withdrawal.count({ where: { userId: user.id } })).toBe(1);
      expect((await walletOf(user.id)).reserved).toBe(MIN_W);
      expect((await walletOf(user.id)).balance).toBe(1000); // untouched until approval
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('submission after the cooldown has elapsed → succeeds normally', async () => {
    const user = await createTestUser(1000);
    try {
      const first = await withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(MIN_W),
        paymentMethod: 'TELEBIRR' as any,
        accountNumber: '+251911223366',
      });

      // Simulate the cooldown fully elapsing by back-dating the last submission
      await prisma.withdrawal.update({
        where: { id: first.id },
        data: { createdAt: new Date(Date.now() - 16 * 60_000) },
      });

      const second = await withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(MIN_W),
        paymentMethod: 'TELEBIRR' as any,
        accountNumber: '+251911223366',
      });
      expect(second.status).toBe('PENDING');
      expect((await walletOf(user.id)).reserved).toBe(2 * MIN_W);
      expect((await walletOf(user.id)).balance).toBe(1000); // untouched until approval
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('a HIGH-risk assessment auto-holds the request (HELD), funds stay reserved, audit recorded', async () => {
    const user = await createTestUser(1000);

    // Drive the REAL risk engine to HIGH deterministically:
    //  S4 bot-timing (weight 35): ≥12 bets placed at exactly-regular gaps
    //    (CV < 0.12, mean gap < 60 s) → metronomic automation pattern.
    //  S6 withdrawal frequency (weight 28): 9 withdrawals in 24h (>8).
    //  35 + 28 = 63 → HIGH (≥50) regardless of the other signals.
    const since24h = new Date(Date.now() - 24 * 60 * 60_000);
    const since1h = new Date(Date.now() - 60 * 60_000);

    // 30 rounds × 1 bet each, placed every 30 s (perfectly regular)
    for (let i = 0; i < 30; i++) {
      const round = await prisma.gameRound.create({
        data: {
          roundNumber: 90000000 + i, // far above production round numbers
          phase: 'SETTLED',
          crashPoint: 2,
          startedAt: new Date(since1h.getTime() + i * 30_000),
          settledAt: new Date(since1h.getTime() + i * 30_000 + 10_000),
        },
      });
      await prisma.bet.create({
        data: {
          userId: user.id,
          roundId: round.id,
          slot: 1,
          amount: money.fromNumber(1),
          status: 'LOST',
          placedAt: new Date(since1h.getTime() + i * 30_000),
        },
      });
    }

    // 9 historical withdrawals in 24h → S6 triggered
    const withdrawals = Array.from({ length: 9 }, (_, i) => ({
      userId: user.id,
      amount: money.fromNumber(MIN_W),
      paymentMethod: 'TELEBIRR',
      accountNumber: '+251911223377',
      status: 'REJECTED',
      createdAt: new Date(since24h.getTime() + i * 60_000),
    }));
    await prisma.withdrawal.createMany({ data: withdrawals as any });

    try {
      const w = await withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(MIN_W),
        paymentMethod: 'TELEBIRR' as any,
        accountNumber: '+251911223377',
      });

      // Sanity: the fixture genuinely reaches HIGH/CRITICAL
      const assessment = await riskEngine.assessUser(user.id);
      expect(['HIGH', 'CRITICAL']).toContain(assessment.level);

      const after = await prisma.withdrawal.findUnique({ where: { id: w.id } });
      expect(after!.status).toBe('HELD');
      expect(after!.rejectionReason).toMatch(/AUTO-HOLD/);
      // Funds remain reserved (a hold never releases the reservation)
      expect((await walletOf(user.id)).reserved).toBe(MIN_W);
      // Audit trail: exactly one system-initiated hold audit
      const audits = await prisma.adminAuditLog.findMany({
        where: { action: 'WITHDRAWAL_HELD', targetId: w.id },
      });
      expect(audits).toHaveLength(1);
      expect(JSON.parse(audits[0].metadata!)).toMatchObject({ systemInitiated: true });

      // A held request is NOT processed: still awaiting admin review
      expect(['PENDING', 'HELD']).toContain(after!.status);
    } finally {
      await cleanupUser(user.id);
      await prisma.gameRound.deleteMany({ where: { roundNumber: { gte: 90000000 } } });
    }
  });

  it('held request is actionable: admin approve clears the hold and pays out exactly once', async () => {
    const user = await createTestUser(1000);
    try {
      const w = await withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(MIN_W),
        paymentMethod: 'CBE' as any,
        accountNumber: '+251911223388',
      });

      // Force into HELD as the risk engine would
      await prisma.withdrawal.update({
        where: { id: w.id },
        data: { status: 'HELD', rejectionReason: 'AUTO-HOLD (HIGH, score 55): test fixture' },
      });

      const result = await withdrawalService.approveWithdrawal({
        withdrawalId: w.id,
        adminId: 'h4-test-admin',
      });
      expect(result.amount).toBe(MIN_W);
      expect(result.newReserved).toBe(0);

      // Double-processing stays impossible from the held state
      await expect(
        withdrawalService.approveWithdrawal({ withdrawalId: w.id, adminId: 'h4-test-admin' })
      ).rejects.toThrow(/already been processed/);
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('held request can be rejected instead — reservation released exactly once', async () => {
    const user = await createTestUser(1000);
    try {
      const w = await withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(MIN_W),
        paymentMethod: 'CBE' as any,
        accountNumber: '+251911223399',
      });
      await prisma.withdrawal.update({
        where: { id: w.id },
        data: { status: 'HELD', rejectionReason: 'AUTO-HOLD (HIGH, score 55): test fixture' },
      });

      const result = await withdrawalService.rejectWithdrawal({
        withdrawalId: w.id,
        adminId: 'h4-test-admin',
        reason: 'Risk review: pattern not justified',
      });
      expect(result.refundedAmount).toBe(MIN_W);
      expect((await walletOf(user.id)).reserved).toBe(0);
      expect((await walletOf(user.id)).balance).toBe(1000); // balance untouched — money only leaves on approve
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('normal low-risk request proceeds through the existing flow unaffected', async () => {
    const user = await createTestUser(1000);
    try {
      const w = await withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(250),
        paymentMethod: 'TELEBIRR' as any,
        accountNumber: '+251911224400',
      });
      expect(w.status).toBe('PENDING'); // NOT held — no risk signals
      expect((await walletOf(user.id)).reserved).toBe(250);
      expect((await walletOf(user.id)).balance).toBe(1000); // untouched until approval

      // And the full existing lifecycle still works end-to-end
      const approved = await withdrawalService.approveWithdrawal({
        withdrawalId: w.id,
        adminId: 'h4-test-admin',
      });
      expect(approved.newReserved).toBe(0);
      expect(approved.newBalance).toBe(750); // THE money-leaves step: 1000 - 250
    } finally {
      await cleanupUser(user.id);
    }
  });
});
