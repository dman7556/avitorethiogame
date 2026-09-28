/**
 * DECISIVE TEST — does an UNVERIFIED deposit (user leaves the amount field
 * empty; isAmountUnverified=true, submittedAmount persisted as 0) get an
 * approval envelope of 0 (H1 guarantee: every free-typed credit requires
 * dual control) or an envelope of maximumDeposit (a bypass: a single admin
 * could credit up to the cap with no second approval)?
 *
 * Context: the pending deposit-routes work makes the user-supplied amount
 * OPTIONAL. approveDeposit()'s envelope is min(10 × submittedAmount, cap).
 * For submittedAmount = 0 that is min(0, cap) = 0 — H1's summary and the
 * "max(...)" prose in a later review contradict each other; this test
 * decides which description matches reality.
 *
 * The service call below mirrors the pending route EXACTLY:
 *   amount: body.amount ?? undefined, isAmountUnverified: !body.amount
 * deposit.service.ts is clean at HEAD, so this exercises the committed
 * approval logic — no working-tree state affects the verdict.
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

describe('H1 envelope for UNVERIFIED deposits (submittedAmount = 0)', () => {
  let adminA: Awaited<ReturnType<typeof createTestUser>>;
  let adminB: Awaited<ReturnType<typeof createTestUser>>;
  let user: Awaited<ReturnType<typeof createTestUser>>;
  let unverifiedDepositId: string;
  const CREDIT = 500; // far below maximumDeposit (50 000), above 0 — the disputed zone

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

  it('single admin, credit below maximumDeposit: envelope is 0 → OVERRIDE_REQUIRED, wallet untouched', async () => {
    const deposit = await makeUnverifiedDeposit();
    unverifiedDepositId = deposit.id;

    const persisted = await prisma.deposit.findUniqueOrThrow({ where: { id: deposit.id } });
    expect(Number(persisted.submittedAmount)).toBe(0); // fixture sanity: unverified ⇒ 0

    const before = await walletBalance();

    await expect(
      depositService.approveDeposit({
        depositId: deposit.id,
        adminId: adminA.id,
        creditAmount: CREDIT,
        reason: 'Manual verification of bank transfer',
      })
    ).rejects.toMatchObject({ code: 'OVERRIDE_REQUIRED' });

    // Not approved, parked for dual control, no money moved:
    const d = await prisma.deposit.findUniqueOrThrow({ where: { id: deposit.id } });
    expect(d.status).toBe('PENDING');
    expect(d.overrideRequestedBy).toBe(adminA.id);
    expect(await walletBalance()).toBe(before);

    const audits = await prisma.adminAuditLog.findMany({
      where: { targetId: deposit.id, action: 'DEPOSIT_OVERRIDE_REQUESTED' },
    });
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0].metadata!).requestedAmount).toBe(CREDIT);
  });

  it('dual control remains the ONLY path: second admin can approve the parked credit', async () => {
    const before = await walletBalance();

    const result = await depositService.approveDeposit({
      depositId: unverifiedDepositId,
      adminId: adminB.id, // different admin — legitimate second approval
      creditAmount: CREDIT,
      reason: 'Second-admin verification',
    });

    expect(result.creditAmount).toBe(CREDIT);
    expect(result.dualControl).toEqual({ requestedBy: adminA.id });
    expect(await walletBalance()).toBe(before + CREDIT);
  });

  async function walletBalance(): Promise<number> {
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    return Number(wallet.balance);
  }
});
