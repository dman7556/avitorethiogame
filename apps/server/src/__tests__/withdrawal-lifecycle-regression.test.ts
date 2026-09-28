/**
 * REGRESSION TESTS — the P0 withdrawal bug found by live testing 2026-09-21.
 *
 * The bug: approveWithdrawal cleared the reservation but never deducted
 * balance, so an "approved and paid out" withdrawal left the user's full
 * balance spendable (money never left the system). Live evidence: approve of
 * 300.00 from a 1000.00 wallet returned oldBalance=1000, newBalance=1000.
 *
 * Contract now under test:
 *   submit  → balance untouched, reserved += amount (available drops)
 *   approve → balance -= amount (money leaves), reserved cleared, exactly once
 *   reject  → reserved released, balance untouched, exactly once
 *   ledger  → Σ(COMPLETED ledger) == balance at every step (reconciliation)
 *
 * Run: npx vitest run src/__tests__/withdrawal-lifecycle-regression.test.ts
 */
import { describe, it, expect } from 'vitest';
import prisma from '../lib/prisma';
import { withdrawalService } from '../services/withdrawal.service';
import { reconciliationService } from '../services/reconciliation.service';
import { money } from '../services/money.helper';

let userCounter = 0;
async function createTestUser(withBalance: number) {
  const suffix = `${Date.now()}-${userCounter++}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.user.create({
    data: {
      name: `wd-reg-user-${suffix}`,
      email: `wd-reg-${suffix}@example.com`,
      phone: `+2519${Math.floor(1000000 + Math.random() * 8999999)}`,
      password: 'x-not-a-real-login',
      wallet: { create: { balance: money.fromNumber(withBalance) } },
    },
    include: { wallet: true },
  });
}

async function cleanupUser(userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (wallet) {
    await prisma.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
  }
  await prisma.withdrawal.deleteMany({ where: { userId } });
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

async function walletOf(userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  return {
    balance: Number(wallet!.balance),
    reserved: Number(wallet!.reserved),
  };
}

describe('withdrawal lifecycle regression (P0: approve must deduct)', () => {
  it('approve permanently deducts the balance — money actually leaves the system', async () => {
    const user = await createTestUser(1000);
    try {
      const w = await withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(300),
        paymentMethod: 'TELEBIRR' as any,
        accountNumber: '+251911230001',
      });

      // Pending: reserved, not spendable, but balance not yet moved
      expect(await walletOf(user.id)).toEqual({ balance: 1000, reserved: 300 });

      const result = await withdrawalService.approveWithdrawal({
        withdrawalId: w.id,
        adminId: 'reg-test-admin',
      });

      // THE BUG REGRESSION: approved payout must reduce balance permanently.
      expect(result.newBalance).toBe(700);
      expect(result.newReserved).toBe(0);
      expect(await walletOf(user.id)).toEqual({ balance: 700, reserved: 0 });

      // Payout ledger row reflects the deduction (marker row stays amount-
      // neutral; the realized movement is its own COMPLETED row)
      const payout = await prisma.walletTransaction.findFirst({
        where: { referenceId: w.id, type: 'WITHDRAWAL', status: 'COMPLETED', metadata: { contains: 'PAYOUT' } },
      });
      expect(payout).toBeTruthy();
      expect(Number(payout!.amount)).toBe(-300);
      expect(Number(payout!.balanceBefore)).toBe(1000);
      expect(Number(payout!.balanceAfter)).toBe(700);
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('reject releases the reservation and leaves balance untouched', async () => {
    const user = await createTestUser(1000);
    try {
      const w = await withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(300),
        paymentMethod: 'CBE' as any,
        accountNumber: '+251911230002',
      });
      expect(await walletOf(user.id)).toEqual({ balance: 1000, reserved: 300 });

      const result = await withdrawalService.rejectWithdrawal({
        withdrawalId: w.id,
        adminId: 'reg-test-admin',
        reason: 'audit regression test',
      });
      expect(result.refundedAmount).toBe(300);
      expect(await walletOf(user.id)).toEqual({ balance: 1000, reserved: 0 });
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('two concurrent pending withdrawals cannot overdraw: each reserves from real availability', async () => {
    const user = await createTestUser(1000);
    try {
      // 1000 balance, min-remaining 500 → max total withdrawal 500.
      // Two pendings of 250: available 1000→750→500 (each passes the rule).
      const w1 = await withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(250),
        paymentMethod: 'TELEBIRR' as any,
        accountNumber: '+251911230003',
      });
      await prisma.withdrawal.update({
        where: { id: w1.id },
        data: { createdAt: new Date(Date.now() - 16 * 60_000) },
      });
      const w2 = await withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(250),
        paymentMethod: 'CBE' as any,
        accountNumber: '+251911230003',
      });

      // 1000 balance; 250 + 250 reserved = 500; available 500. A third
      // withdrawal (min 100) would leave remaining 400 < 500 → rejected by
      // the remaining-balance rule, never overdrawn.
      await prisma.withdrawal.update({
        where: { id: w2.id },
        data: { createdAt: new Date(Date.now() - 16 * 60_000) },
      });
      await expect(
        withdrawalService.createWithdrawal({
          userId: user.id,
          amount: money.fromNumber(100),
          paymentMethod: 'TELEBIRR' as any,
          accountNumber: '+251911230003',
        })
      ).rejects.toThrow(/at least/i);

      expect(await walletOf(user.id)).toEqual({ balance: 1000, reserved: 500 });

      // Approve BOTH: total paid out 500, wallet ends at exactly 500
      const a1 = await withdrawalService.approveWithdrawal({ withdrawalId: w1.id, adminId: 'reg-test-admin' });
      const a2 = await withdrawalService.approveWithdrawal({ withdrawalId: w2.id, adminId: 'reg-test-admin' });
      expect(a1.newBalance).toBe(750);
      expect(a2.newBalance).toBe(500);
      expect(await walletOf(user.id)).toEqual({ balance: 500, reserved: 0 });
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('reconciliation invariant (Σ COMPLETED ledger == balance) holds at every lifecycle state', async () => {
    const user = await createTestUser(0);
    // Seed the wallet through a proper ledger row so the invariant under test
    // starts from a consistent state (balance 1000 == Σ ledger).
    await prisma.walletTransaction.create({
      data: {
        walletId: user.wallet!.id,
        type: 'ADMIN_CREDIT',
        amount: money.fromNumber(1000),
        balanceBefore: money.fromNumber(0),
        balanceAfter: money.fromNumber(1000),
        status: 'COMPLETED',
        description: 'regression test seed',
      },
    });    await prisma.wallet.update({ where: { userId: user.id }, data: { balance: money.fromNumber(1000) } });
    try {
      // State 1: pre-submission (consistent baseline)
      let r = await reconciliationService.checkWallet(user.wallet!.id);
      expect(r.consistent).toBe(true);

      const w = await withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(300),
        paymentMethod: 'TELEBIRR' as any,
        accountNumber: '+251911230004',
      });

      // State 2: PENDING — balance untouched, reservation is a PENDING hold row
      r = await reconciliationService.checkWallet(user.wallet!.id);
      expect(r.consistent).toBe(true);

      // State 3: REJECTED — −300 hold + 300 refund pair sums to zero
      await withdrawalService.rejectWithdrawal({
        withdrawalId: w.id,
        adminId: 'reg-test-admin',
        reason: 'reconciliation state test',
      });
      r = await reconciliationService.checkWallet(user.wallet!.id);
      expect(r.consistent).toBe(true);

      // State 4: another withdrawal APPROVED — −300 COMPLETED, balance 700
      // (back-date past the cooldown first — the rejected request started it)
      await prisma.withdrawal.update({
        where: { id: w.id },
        data: { createdAt: new Date(Date.now() - 16 * 60_000) },
      });
      const w2 = await withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(300),
        paymentMethod: 'TELEBIRR' as any,
        accountNumber: '+251911230004',
      });
      await withdrawalService.approveWithdrawal({ withdrawalId: w2.id, adminId: 'reg-test-admin' });
      r = await reconciliationService.checkWallet(user.wallet!.id);
      expect(r.consistent).toBe(true);
      expect(r.balance).toBe(700);
      expect(r.ledgerSum).toBe(700);
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('approve and reject are mutually exclusive — whichever runs first wins exactly once', async () => {
    const user = await createTestUser(1000);
    try {
      const w = await withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(300),
        paymentMethod: 'CBE' as any,
        accountNumber: '+251911230005',
      });

      await withdrawalService.approveWithdrawal({ withdrawalId: w.id, adminId: 'reg-test-admin' });

      await expect(
        withdrawalService.rejectWithdrawal({ withdrawalId: w.id, adminId: 'reg-test-admin', reason: 'late' })
      ).rejects.toThrow(/already been processed/);
      await expect(
        withdrawalService.approveWithdrawal({ withdrawalId: w.id, adminId: 'reg-test-admin' })
      ).rejects.toThrow(/already been processed/);

      // And the wallet kept the deducted figure — no refund leaked back
      expect(await walletOf(user.id)).toEqual({ balance: 700, reserved: 0 });
    } finally {
      await cleanupUser(user.id);
    }
  });
});
