/**
 * H1 REGRESSION TESTS — Deposit approval envelope + dual control.
 *
 * Risks being guarded against:
 *  1. An admin could previously credit ANY amount (no envelope) — a compromised
 *     or rogue admin session could mint money.
 *  2. No second-approval path existed at all.
 *
 * The fix: creditAmount must be ≤ min(10 × submittedAmount, maximumDeposit).
 * Above that envelope the credit is NOT applied — an override request is
 * recorded and a DIFFERENT admin must approve it for the same amount.
 * maximumDeposit is a hard ceiling regardless of the 10× multiplier.
 *
 * NOTE: admins are REAL User rows here — AdminAuditLog has an FK to User, and
 * audit writes are non-critical (failures swallowed), so fake admin IDs would
 * make the audit assertions silently vacuous.
 *
 * Run with: npx vitest run src/__tests__/deposit-dual-control.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../lib/prisma';
import { depositService } from '../services/deposit.service';
import { money } from '../services/money.helper';

const PREFIX = 'h1-test-';

async function createTestUser(name: string, withBalance = 0) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.user.create({
    data: {
      name: `${PREFIX}${name}`,
      email: `${PREFIX}${name}-${suffix}@example.com`,
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
    where: { referenceId: { in: (await prisma.deposit.findMany({ where: { userId } })).map((d) => d.id) } },
  });
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.adminAuditLog.deleteMany({ where: { OR: [{ adminId: userId }, { targetUserId: userId }] } });
  await prisma.deposit.deleteMany({ where: { userId } });
  await prisma.wallet.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

async function walletBalance(userId: string): Promise<number> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  return Number(wallet!.balance);
}

describe('H1: deposit approval envelope + dual control', () => {
  let adminA: Awaited<ReturnType<typeof createTestUser>>; // requesting admin
  let adminB: Awaited<ReturnType<typeof createTestUser>>; // second (approving) admin
  let user: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    await prisma.$connect();
    [adminA, adminB, user] = await Promise.all([
      createTestUser('admin-a'),
      createTestUser('admin-b'),
      createTestUser('depositor'),
    ]);
  });

  afterAll(async () => {
    await Promise.all([adminA, adminB, user].map((u) => u && cleanupUser(u.id)));
    await prisma.$disconnect();
  });

  function makeDeposit(amount: number) {
    return depositService.createDeposit({
      userId: user.id,
      amount: money.fromNumber(amount),
      paymentMethod: 'TELEBIRR' as any,
      screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/h1-test.jpg',
      screenshotPublicId: `skyrush/deposits/screenshots/h1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
  }

  it('credit within the envelope: applies normally with a single admin, audit logged with the reason', async () => {
    const deposit = await makeDeposit(500); // envelope = min(10×500, 50000) = 5000
    const result = await depositService.approveDeposit({
      depositId: deposit.id,
      adminId: adminA.id,
      creditAmount: 450,
      reason: 'Bank statement matches submission',
    });

    expect(result.creditAmount).toBe(450);
    expect(result.dualControl ?? null).toBeNull();
    expect(await walletBalance(user.id)).toBe(450);

    const audits = await prisma.adminAuditLog.findMany({ where: { targetId: deposit.id } });
    const approved = audits.find((a) => a.action === 'DEPOSIT_APPROVED');
    expect(approved).toBeTruthy();
    expect(approved!.adminId).toBe(adminA.id);
    expect(JSON.parse(approved!.metadata!).reason).toBe('Bank statement matches submission');
    expect(audits.some((a) => a.action === 'DEPOSIT_OVERRIDE_REQUESTED')).toBe(false);
  });

  describe('out-of-envelope credit requires dual control', () => {
    let depositId: string;
    const CREDIT = 6000; // > envelope 5000, < cap 50000

    it('first admin: request recorded, credit BLOCKED, wallet untouched, audit written', async () => {
      const deposit = await makeDeposit(500);
      depositId = deposit.id;
      const before = await walletBalance(user.id);

      await expect(
        depositService.approveDeposit({
          depositId,
          adminId: adminA.id,
          creditAmount: CREDIT,
          reason: 'Verified via direct bank confirmation call',
        })
      ).rejects.toMatchObject({ code: 'OVERRIDE_REQUIRED' });

      const d = await prisma.deposit.findUniqueOrThrow({ where: { id: depositId } });
      expect(d.status).toBe('PENDING'); // not approved
      expect(d.overrideRequestedBy).toBe(adminA.id);
      expect(Number(d.overrideAmount)).toBe(CREDIT);
      expect(await walletBalance(user.id)).toBe(before); // wallet NOT credited

      const audits = await prisma.adminAuditLog.findMany({
        where: { targetId: depositId, action: 'DEPOSIT_OVERRIDE_REQUESTED' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0].adminId).toBe(adminA.id);
      expect(JSON.parse(audits[0].metadata!).requestedAmount).toBe(CREDIT);
    });

    it('same admin cannot both request and approve — rejected, wallet still untouched', async () => {
      const before = await walletBalance(user.id);

      await expect(
        depositService.approveDeposit({
          depositId,
          adminId: adminA.id, // the SAME admin who requested
          creditAmount: CREDIT,
          reason: 'Self-approval attempt',
        })
      ).rejects.toMatchObject({ code: 'DUAL_CONTROL_SAME_ADMIN' });

      const d = await prisma.deposit.findUniqueOrThrow({ where: { id: depositId } });
      expect(d.status).toBe('PENDING');
      expect(d.overrideApprovedBy).toBeNull();
      expect(await walletBalance(user.id)).toBe(before);

      const audits = await prisma.adminAuditLog.findMany({
        where: { targetId: depositId, action: 'DEPOSIT_OVERRIDE_REJECTED' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0].adminId).toBe(adminA.id);
    });

    it('second, different admin approves the same amount: credited, full audit chain reconstructable', async () => {
      const before = await walletBalance(user.id);

      const result = await depositService.approveDeposit({
        depositId,
        adminId: adminB.id, // DIFFERENT admin
        creditAmount: CREDIT,
        reason: 'Second-admin verification of bank confirmation',
      });

      expect(result.creditAmount).toBe(CREDIT);
      expect(result.dualControl).toEqual({ requestedBy: adminA.id });
      expect(await walletBalance(user.id)).toBe(before + CREDIT);

      const audits = await prisma.adminAuditLog.findMany({ where: { targetId: depositId } });
      const actions = audits.map((a) => a.action);
      expect(actions).toContain('DEPOSIT_OVERRIDE_REQUESTED');
      expect(actions).toContain('DEPOSIT_OVERRIDE_APPROVED');
      expect(actions).toContain('DEPOSIT_APPROVED');

      const overrideApproved = audits.find((a) => a.action === 'DEPOSIT_OVERRIDE_APPROVED')!;
      expect(overrideApproved.adminId).toBe(adminB.id);
      expect(JSON.parse(overrideApproved.metadata!).requestedBy).toBe(adminA.id);

      const finalApproval = audits.find((a) => a.action === 'DEPOSIT_APPROVED')!;
      const meta = JSON.parse(finalApproval.metadata!);
      expect(meta.dualControl).toEqual({ requestedBy: adminA.id, approvedBy: adminB.id });
    });
  });

  it('maximumDeposit is a hard ceiling: blocked even when within 10× submittedAmount', async () => {
    const deposit = await makeDeposit(10000); // 10× = 100000, but cap = 50000 → envelope 50000
    const before = await walletBalance(user.id);

    await expect(
      depositService.approveDeposit({
        depositId: deposit.id,
        adminId: adminA.id,
        creditAmount: 51000, // within 10× but above the hard cap
        reason: 'VIP top-up attempt',
      })
    ).rejects.toMatchObject({ code: 'OVERRIDE_REQUIRED' });

    const d = await prisma.deposit.findUniqueOrThrow({ where: { id: deposit.id } });
    expect(d.status).toBe('PENDING');
    expect(d.overrideRequestedBy).toBe(adminA.id); // parked for dual control, not applied
    expect(await walletBalance(user.id)).toBe(before);
  });
});
