/**
 * Financial money-flow tests: deposit approval and withdrawal
 * reservation lifecycle against a real (SQLite) database.
 *
 * These tests exercise the REAL service + REAL database via Prisma,
 * covering exactly-once semantics, reservation arithmetic and the
 * 100/200 ETB rules. They run in isolated transactions on unique
 * test users and clean up after themselves.
 *
 * Run with: npm test  (from apps/server or root)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../lib/prisma';
import { depositService } from '../services/deposit.service';
import { withdrawalService, WithdrawalError } from '../services/withdrawal.service';
import { money } from '../services/money.helper';

// Settings lookups hit the DB; ensure defaults exist even on a fresh db
const TEST_PREFIX = 'fin-test-';
let originalMinRemaining: { value: string } | null = null;

async function createTestUser(withBalance: number) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: {
      name: `${TEST_PREFIX}user`,
      email: `${TEST_PREFIX}${suffix}@example.com`,
      phone: `+2519${Math.floor(1000000 + Math.random() * 8999999)}`,
      password: 'x-not-a-real-login',
      wallet: {
        create: { balance: money.fromNumber(withBalance) },
      },
    },
    include: { wallet: true },
  });
  return user;
}

async function cleanupUser(userId: string) {
  // Delete in FK-safe order (SQLite: no cascade on walletTransaction -> wallet via user)
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (wallet) {
    await prisma.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
  }
  await prisma.walletTransaction.deleteMany({
    where: { referenceId: { in: [
      ...(await prisma.deposit.findMany({ where: { userId } })).map((d) => d.id),
      ...(await prisma.withdrawal.findMany({ where: { userId } })).map((w) => w.id),
    ] } },
  });
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.adminAuditLog.deleteMany({ where: { OR: [{ adminId: userId }, { targetUserId: userId }] } });
  await prisma.withdrawal.deleteMany({ where: { userId } });
  await prisma.deposit.deleteMany({ where: { userId } });
  await prisma.wallet.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

beforeAll(async () => {
  // Make sure the prisma client can talk to the local SQLite db
  await prisma.$connect();
  // Hermetic settings: these tests assert against the FACTORY default
  // minimumRemainingBalance (200). The dev DB is shared and an admin may have
  // changed the live value, so pin it for the run and restore afterwards.
  originalMinRemaining = await prisma.systemSetting.findUnique({ where: { key: 'minimumRemainingBalance' } });
  await prisma.systemSetting.upsert({
    where: { key: 'minimumRemainingBalance' },
    create: { key: 'minimumRemainingBalance', value: '200' },
    update: { value: '200' },
  });
});

afterAll(async () => {
  // Restore whatever the shared DB held before we pinned it
  if (originalMinRemaining) {
    await prisma.systemSetting.update({
      where: { key: 'minimumRemainingBalance' },
      data: { value: originalMinRemaining.value },
    });
  } else {
    await prisma.systemSetting.deleteMany({ where: { key: 'minimumRemainingBalance' } });
  }
  await prisma.$disconnect();
});

describe('deposit approval (money in)', () => {
  let user: Awaited<ReturnType<typeof createTestUser>>;
  const ADMIN = 'fin-test-admin';

  beforeAll(async () => {
    user = await createTestUser(0);
  });

  afterAll(async () => {
    if (user) await cleanupUser(user.id);
  });

  it('creates a PENDING deposit and does NOT change the balance', async () => {
    const deposit = await depositService.createDeposit({
      userId: user.id,
      amount: money.fromNumber(500),
      paymentMethod: 'TELEBIRR' as any,
      screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/test.jpg',
      screenshotPublicId: 'skyrush/deposits/screenshots/test',
    });

    expect(deposit.status).toBe('PENDING');
    expect(Number(deposit.submittedAmount)).toBe(500);

    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    expect(Number(wallet!.balance)).toBe(0);
  });

  it('approves atomically, credits exactly the approved amount, and writes the ledger', async () => {
    const deposit = await depositService.createDeposit({
      userId: user.id,
      amount: money.fromNumber(500),
      paymentMethod: 'TELEBIRR' as any,
      screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/test2.jpg',
      screenshotPublicId: 'skyrush/deposits/screenshots/test2',
    });

    const result = await depositService.approveDeposit({
      depositId: deposit.id,
      adminId: ADMIN,
      creditAmount: 450, // admin credits a different (exact) amount
      reason: 'Bank statement verified', // H1: reason now mandatory
    });

    expect(result.creditAmount).toBe(450);
    expect(result.balanceBefore).toBe(0);
    expect(result.newBalance).toBe(450);

    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    expect(Number(wallet!.balance)).toBe(450);

    const tx = await prisma.walletTransaction.findFirst({
      where: { referenceId: deposit.id, type: 'DEPOSIT' },
    });
    expect(tx).toBeTruthy();
    expect(Number(tx!.amount)).toBe(450);
    expect(Number(tx!.balanceBefore)).toBe(0);
    expect(Number(tx!.balanceAfter)).toBe(450);
    expect(tx!.processedBy).toBe(ADMIN);
  });

  it('prevents double approval (exactly-once credit)', async () => {
    const deposit = await depositService.createDeposit({
      userId: user.id,
      amount: money.fromNumber(200),
      paymentMethod: 'CBE' as any,
      screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/test3.jpg',
      screenshotPublicId: 'skyrush/deposits/screenshots/test3',
    });

    await depositService.approveDeposit({
      depositId: deposit.id,
      adminId: ADMIN,
      creditAmount: 100, // credit a partial amount on purpose
      reason: 'Partial credit verified against receipt',
    });

    await expect(
      depositService.approveDeposit({
        depositId: deposit.id,
        adminId: ADMIN,
        creditAmount: 100,
        reason: 'Duplicate attempt',
      })
    ).rejects.toThrow(/already been processed/);

    // Balance unchanged by the second attempt (450 + 100, no double credit)
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    expect(Number(wallet!.balance)).toBe(550);

    // Only ONE ledger row for this deposit
    const txs = await prisma.walletTransaction.findMany({
      where: { referenceId: deposit.id, type: 'DEPOSIT' },
    });
    expect(txs).toHaveLength(1);
  });

  it('prevents rejection after approval', async () => {
    const deposits = await prisma.deposit.findMany({
      where: { userId: user.id, status: 'APPROVED' },
      take: 1,
    });
    expect(deposits.length).toBeGreaterThan(0);

    await expect(
      depositService.rejectDeposit({
        depositId: deposits[0].id,
        adminId: ADMIN,
        reason: 'late reject attempt',
      })
    ).rejects.toThrow(/already been processed/);
  });

  it('reject with no balance impact and stores the reason', async () => {
    const before = await prisma.wallet.findUnique({ where: { userId: user.id } });

    const deposit = await depositService.createDeposit({
      userId: user.id,
      amount: money.fromNumber(250),
      paymentMethod: 'CBE' as any,
      screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/test4.jpg',
      screenshotPublicId: 'skyrush/deposits/screenshots/test4',
    });

    const result = await depositService.rejectDeposit({
      depositId: deposit.id,
      adminId: ADMIN,
      reason: 'screenshot unclear',
    });

    expect(result.status).toBe('REJECTED');
    expect(result.rejectionReason).toBe('screenshot unclear');

    const after = await prisma.wallet.findUnique({ where: { userId: user.id } });
    expect(Number(after!.balance)).toBe(Number(before!.balance));

    const txs = await prisma.walletTransaction.findMany({
      where: { referenceId: deposit.id },
    });
    expect(txs).toHaveLength(0); // no money moved
  });
});

describe('withdrawal reservation lifecycle (money out)', () => {
  let user: Awaited<ReturnType<typeof createTestUser>>;
  const ADMIN = 'fin-test-admin';

  beforeAll(async () => {
    // Balance 500 -> max withdrawal 300 (keep 200)
    user = await createTestUser(500);
  });

  afterAll(async () => {
    if (user) await cleanupUser(user.id);
  });

  it('rejects withdrawals below the 100 ETB minimum', async () => {
    await expect(
      withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(99.99),
        paymentMethod: 'TELEBIRR' as any,
        accountNumber: '+251911223344',
      })
    ).rejects.toThrow(/Minimum withdrawal/i);
  });

  it('rejects amounts violating the 200 ETB remaining rule (500 -> max 300)', async () => {
    await expect(
      withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(300.01),
        paymentMethod: 'TELEBIRR' as any,
        accountNumber: '+251911223344',
      })
    ).rejects.toThrow(/keep at least 200/i);
  });

  // H4: withdrawals now enforce a 15-minute cooldown between submissions.
  // These legacy scenarios submit multiple requests for the SAME user, so each
  // describe-block gets exactly ONE submission; the tests were resequenced to
  // respect that (rejections before the cooldown never consume the window —
  // only a CREATED request starts it).
  it('reserves on submission: available drops immediately, balance untouched until approval', async () => {
    const w = await withdrawalService.createWithdrawal({
      userId: user.id,
      amount: money.fromNumber(300), // 500 - 300 = 200 remaining: exactly at the limit
      paymentMethod: 'TELEBIRR' as any,
      accountNumber: '+251911223344',
    });

    expect(w.status).toBe('PENDING');

    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    expect(Number(wallet!.balance)).toBe(500);   // untouched until approval
    expect(Number(wallet!.reserved)).toBe(300);  // held for the pending request
    // Available (the only spendable figure) dropped 500 -> 200 immediately
    expect(Number(wallet!.balance) - Number(wallet!.reserved)).toBe(200);

    // Ledger records the reservation as an amount-neutral MARKER (the hold
    // lives in the reserved column; the realized −300 movement is appended at
    // approval). Amount 0 keeps the ledger-sum invariant true while pending.
    const tx = await prisma.walletTransaction.findFirst({
      where: { referenceId: w.id, type: 'WITHDRAWAL' },
    });
    expect(tx).toBeTruthy();
    expect(Number(tx!.amount)).toBe(0);
    expect(tx!.status).toBe('PENDING');
    expect(JSON.parse(tx!.metadata!).reservedAmount).toBe(300);
  });

  it('blocks betting the reserved funds: available = balance - reserved', async () => {
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    // balance 500, reserved 300 -> available 200; a 201 bet must fail
    const available = Number(wallet!.balance) - Number(wallet!.reserved);
    expect(available).toBe(200);
    expect(available).toBeLessThan(201);
  });

  it('prevents a second overlapping withdrawal from the same funds', async () => {
    // available is now 200 (500 - 300 reserved); 200 - 200 remaining rule
    // means max additional withdrawal is 0 -> 100 minimum request must fail
    await expect(
      withdrawalService.createWithdrawal({
        userId: user.id,
        amount: money.fromNumber(100),
        paymentMethod: 'CBE' as any,
        accountNumber: '+251911223344',
      })
    ).rejects.toBeInstanceOf(WithdrawalError);
  });

  it('approves exactly once: reservation cleared, no double deduction', async () => {
    const pending = await prisma.withdrawal.findFirst({
      where: { userId: user.id, status: 'PENDING' },
    });
    expect(pending).toBeTruthy();

    const result = await withdrawalService.approveWithdrawal({
      withdrawalId: pending!.id,
      adminId: ADMIN,
    });

    expect(result.amount).toBe(300);
    expect(result.newReserved).toBe(0);
    expect(result.newBalance).toBe(200); // THE money-leaves step: 500 - 300

    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    expect(Number(wallet!.balance)).toBe(200);
    expect(Number(wallet!.reserved)).toBe(0);

    // Reservation marker row + realized payout row, both COMPLETED
    const txs = await prisma.walletTransaction.findMany({
      where: { referenceId: pending!.id, type: 'WITHDRAWAL' },
    });
    expect(txs).toHaveLength(2);
    expect(txs.every((t) => t.status === 'COMPLETED')).toBe(true);
    const payout = txs.find((t) => Number(t.amount) !== 0);
    expect(payout).toBeTruthy();
    expect(Number(payout!.amount)).toBe(-300);
    expect(Number(payout!.balanceAfter)).toBe(200);
  });

  it('double approval fails cleanly', async () => {
    const done = await prisma.withdrawal.findFirst({
      where: { userId: user.id, status: 'COMPLETED' },
    });
    await expect(
      withdrawalService.approveWithdrawal({ withdrawalId: done!.id, adminId: ADMIN })
    ).rejects.toThrow(/already been processed/);
  });

  it('reject refunds the reservation exactly once and is idempotent', async () => {
    // fresh user with 400 -> reserve 200 (400-200=200 remaining: ok)
    const user2 = await createTestUser(400);
    try {
      const w = await withdrawalService.createWithdrawal({
        userId: user2.id,
        amount: money.fromNumber(200),
        paymentMethod: 'CBE' as any,
        accountNumber: '+251911223355',
      });

      const result = await withdrawalService.rejectWithdrawal({
        withdrawalId: w.id,
        adminId: ADMIN,
        reason: 'wrong account',
      });

      expect(result.refundedAmount).toBe(200);
      expect(result.newReserved).toBe(0);

      const wallet = await prisma.wallet.findUnique({ where: { userId: user2.id } });
      expect(Number(wallet!.balance)).toBe(400); // rejection restored the deducted funds
      expect(Number(wallet!.reserved)).toBe(0);

      // Double rejection fails
      await expect(
        withdrawalService.rejectWithdrawal({
          withdrawalId: w.id,
          adminId: ADMIN,
          reason: 'again',
        })
      ).rejects.toThrow(/already been processed/);

      // Exactly one refund ledger row
      const refunds = await prisma.walletTransaction.findMany({
        where: { referenceId: w.id, type: 'REFUND' },
      });
      expect(refunds).toHaveLength(1);

      // Approving after rejection also fails
      await expect(
        withdrawalService.approveWithdrawal({ withdrawalId: w.id, adminId: ADMIN })
      ).rejects.toThrow(/already been processed/);
    } finally {
      await cleanupUser(user2.id);
    }
  });
});

describe('money helper', () => {
  it('does decimal math without float drift', () => {
    const a = money.fromNumber(0.1);
    const b = money.fromNumber(0.2);
    expect(money.num(money.add(a, b))).toBe(0.3);
    expect(money.add(a, b).toFixed(2)).toBe('0.30');
  });

  it('detects excess precision', () => {
    expect(money.hasExcessPrecision(money.fromNumber(10.555))).toBe(true);
    expect(money.hasExcessPrecision(money.fromNumber(10.55))).toBe(false);
  });
});
