/**
 * UNVERIFIED deposits (user leaves the amount field empty;
 * isAmountUnverified=true, submittedAmount persisted as 0).
 *
 * Product decision (2026-09-30): a single admin may credit up to the
 * maximumDeposit setting on ANY deposit — including unverified ones. The
 * earlier min(10 × submittedAmount, cap) envelope gave unverified deposits
 * an envelope of 0, wedging them in PENDING forever wherever only one admin
 * account exists (the operator's actual situation). Credits ABOVE the cap
 * still require dual control.
 *
 * The service call below mirrors the pending route EXACTLY:
 *   amount: body.amount ?? undefined, isAmountUnverified: !body.amount
 *
 * Run: npx vitest run src/__tests__/deposit-unverified-envelope.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../lib/prisma';
import { depositService } from '../services/deposit.service';
import { money } from '../services/money.helper';

const PREFIX = 'h1-unverified-';

async function createTestUser(name: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.user.create({
    data: {
      name: `${PREFIX}${name}`,
      email: `${PREFIX}${name}-${suffix}@example.com`,
      phone: `+2519${Math.floor(1000000 + Math.random() * 8999999)}`,
      password: 'x-not-a-real-login',
      wallet: { create: { balance: money.fromNumber(0) } },
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

describe('UNVERIFIED deposits (submittedAmount = 0): single-admin approval within the cap', () => {
  let adminA: Awaited<ReturnType<typeof createTestUser>>;
  let adminB: Awaited<ReturnType<typeof createTestUser>>;
  let user: Awaited<ReturnType<typeof createTestUser>>;
  let unverifiedDepositId: string;
  const CREDIT = 500; // far below maximumDeposit (50 000) — a normal single-admin approval

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

  function makeUnverifiedDeposit() {
    // Mirrors the pending route for an empty amount field:
    //   amount: body.amount ?? undefined, isAmountUnverified: !body.amount
    return depositService.createDeposit({
      userId: user.id,
      amount: undefined,
      isAmountUnverified: true,
      paymentMethod: 'TELEBIRR' as any,
      screenshotUrl: 'https://res.cloudinary.com/demo/image/upload/h1-unverified-test.jpg',
      screenshotPublicId: `skyrush/deposits/screenshots/h1-unverified-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
  }

  it('single admin, credit below maximumDeposit: approved normally, exact amount credited', async () => {
    const deposit = await makeUnverifiedDeposit();
    unverifiedDepositId = deposit.id;

    const persisted = await prisma.deposit.findUniqueOrThrow({ where: { id: deposit.id } });
    expect(Number(persisted.submittedAmount)).toBe(0); // fixture sanity: unverified ⇒ 0

    const before = await walletBalance();

    const result = await depositService.approveDeposit({
      depositId: deposit.id,
      adminId: adminA.id,
      creditAmount: CREDIT,
      reason: 'Manual verification of bank transfer',
    });

    // Approved with NO dual control, wallet credited EXACTLY the admin's amount:
    expect(result.creditAmount).toBe(CREDIT);
    expect(result.dualControl ?? null).toBeNull();
    expect(await walletBalance()).toBe(before + CREDIT);

    const d = await prisma.deposit.findUniqueOrThrow({ where: { id: deposit.id } });
    expect(d.status).toBe('APPROVED');
    expect(Number(d.verifiedAmount)).toBe(CREDIT);
    expect(d.overrideRequestedBy).toBeNull();

    const audits = await prisma.adminAuditLog.findMany({
      where: { targetId: deposit.id, action: 'DEPOSIT_APPROVED' },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0].metadata!).reason).toBe('Manual verification of bank transfer');
  });

  it('credit ABOVE maximumDeposit still requires a second admin even on an unverified deposit', async () => {
    // The same parked deposit was already approved; make a fresh one.
    const deposit = await makeUnverifiedDeposit();
    const before = await walletBalance();
    const OVER_CAP = 60000; // > maximumDeposit (50 000)

    await expect(
      depositService.approveDeposit({
        depositId: deposit.id,
        adminId: adminA.id,
        creditAmount: OVER_CAP,
        reason: 'Above single-admin authority',
      })
    ).rejects.toMatchObject({ code: 'OVERRIDE_REQUIRED' });

    // Parked for dual control, no money moved:
    const d = await prisma.deposit.findUniqueOrThrow({ where: { id: deposit.id } });
    expect(d.status).toBe('PENDING');
    expect(d.overrideRequestedBy).toBe(adminA.id);
    expect(await walletBalance()).toBe(before);

    // Second, different admin approving the same amount completes it:
    const result = await depositService.approveDeposit({
      depositId: deposit.id,
      adminId: adminB.id,
      creditAmount: OVER_CAP,
      reason: 'Second-admin verification',
    });
    expect(result.creditAmount).toBe(OVER_CAP);
    expect(result.dualControl).toEqual({ requestedBy: adminA.id });
    expect(await walletBalance()).toBe(before + OVER_CAP);
  });

  async function walletBalance(): Promise<number> {
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    return Number(wallet.balance);
  }
});
