/**
 * H2 REGRESSION TESTS — auto-cashout vs crash ordering.
 *
 * Bugs guarded against:
 *  1. The tick loop used to process auto-cashouts BEFORE its crash check,
 *     so a bet with autoCashout == the crash multiplier could be paid at
 *     the crash tick (paid-at-crash window that also interacted with the
 *     pre-C1 double-pay path).
 *  2. Inline DB work in the interval delayed the tick/crash broadcast.
 *
 * After the fix, GameEngine.processAutoCashoutsForTick() (the extracted,
 * public, testable batch processor the tick loop calls off-interval)
 * returns without processing anything the moment the multiplier has
 * reached the crash point — crash takes precedence at the exact boundary.
 *
 * Run with: npx vitest run src/__tests__/auto-cashout-order.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../lib/prisma';
import { GameEngine } from '../game/GameEngine';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import { GamePhase, BetStatus } from '../shared/types';

const TEST_PREFIX = 'h2-test-';
let io: SocketIOServer;
let httpServer: http.Server;
let engine: GameEngine;

async function createFixture(
  autoCashout: number,
  betAmount = 5,
  crashPoint = 2.0,
  startedAgoMs = 9_000 // server-derived multiplier ≈ 1.57 — below the 2.0 crash
) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const roundNumber = 980_000 + Math.floor(Math.random() * 9_000);
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
      crashPoint,
      startedAt: new Date(Date.now() - startedAgoMs),
    },
  });
  const bet = await prisma.bet.create({
    data: {
      userId: user.id,
      roundId: round.id,
      slot: 1,
      amount: betAmount,
      status: BetStatus.ACTIVE,
      autoCashout,
      placedAt: new Date(),
    },
  });
  return { user, round, bet };
}

async function cleanup(userId: string, roundId: string, betId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (wallet) await prisma.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
  await prisma.bet.deleteMany({ where: { id: betId } });
  await prisma.gameRound.deleteMany({ where: { id: roundId } });
  await prisma.wallet.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

async function walletBalance(userId: string): Promise<number> {
  const w = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  return Number(w.balance);
}

beforeAll(async () => {
  await prisma.$connect();
  httpServer = http.createServer();
  io = new SocketIOServer(httpServer);
  engine = new GameEngine(io); // production path: provably-fair mode unused here
  await new Promise<void>((r) => httpServer.listen(0, r));
});

afterAll(async () => {
  io.close();
  httpServer.close();
  await prisma.$disconnect();
});

describe('H2 — crash-first auto-cashout ordering', () => {
  it('does NOT pay a bet whose autoCashout EQUALS the crash multiplier', async () => {
    // crashPoint 2.0, autoCashout exactly 2.0 — the exact boundary.
    const { user, round, bet } = await createFixture(2.0);
    try {
      const before = await walletBalance(user.id);

      await engine.processAutoCashoutsForTick(round.id, 2.0, 2.0);

      const after = await walletBalance(user.id);
      expect(after).toBe(before); // untouched — crash takes precedence
      const settled = await prisma.bet.findUniqueOrThrow({ where: { id: bet.id } });
      expect(settled.status).toBe(BetStatus.ACTIVE); // still in play
    } finally {
      await cleanup(user.id, round.id, bet.id);
    }
  });

  it('does NOT pay an autoCashout ABOVE the crash point either', async () => {
    const { user, round, bet } = await createFixture(2.5);
    try {
      const before = await walletBalance(user.id);
      await engine.processAutoCashoutsForTick(round.id, 2.1, 2.0);
      expect(await walletBalance(user.id)).toBe(before);
    } finally {
      await cleanup(user.id, round.id, bet.id);
    }
  });

  it('DOES pay legitimate auto-cashouts below the crash point (no overcorrection)', async () => {
    // autoCashout 1.5 < crashPoint 2.0, tick multiplier 1.52 ≥ 1.5 → pays.
    const { user, round, bet } = await createFixture(1.5);
    try {
      const before = await walletBalance(user.id);
      await engine.processAutoCashoutsForTick(round.id, 1.52, 2.0);
      const after = await walletBalance(user.id);
      expect(after).toBeCloseTo(before + 5 * 1.52, 2);
      const settled = await prisma.bet.findUniqueOrThrow({ where: { id: bet.id } });
      expect(settled.status).toBe(BetStatus.CASHED_OUT);
    } finally {
      await cleanup(user.id, round.id, bet.id);
    }
  });

  it('mixed batch in one tick: below-crash bets pay, at-crash bet is blocked', async () => {
    // Three bets with different thresholds under the SAME tick values
    // (multiplier 2.5, crash 3.0): 1.3 and 1.8 pay; the 3.0 (== crash)
    // one is blocked by the crash guard. startedAgo 19 s ⇒ server-derived
    // multiplier ≈ 2.6 — above the requested values, below the crash.
    const a = await createFixture(1.3, 5, 3.0, 19_000);
    const b = await createFixture(1.8, 5, 3.0, 19_000);
    const c = await createFixture(3.0, 5, 3.0, 19_000);

    try {
      const [aBefore, bBefore, cBefore] = await Promise.all([
        walletBalance(a.user.id),
        walletBalance(b.user.id),
        walletBalance(c.user.id),
      ]);

      // Under full-suite load, DB round-trips between fixture creation and
      // the engine call can take seconds — enough for the server-derived
      // multiplier to drift past the crash point. Re-anchor startedAt NOW so
      // the server multiplier ≈ 2.6 at the moment of the call (in production
      // the engine reads startedAt every tick, milliseconds before acting).
      await Promise.all(
        [a.round.id, b.round.id, c.round.id].map((id) =>
          prisma.gameRound.update({
            where: { id },
            data: { startedAt: new Date(Date.now() - 19_000) },
          })
        )
      );

      // processAutoCashoutsForTick is scoped to one round; call it per round
      // as the engine would per round-tick. All three share the same
      // (multiplier=2.5, crash=3.0) tick values.
      await Promise.all([
        engine.processAutoCashoutsForTick(a.round.id, 2.5, 3.0),
        engine.processAutoCashoutsForTick(b.round.id, 2.5, 3.0),
        engine.processAutoCashoutsForTick(c.round.id, 2.5, 3.0),
      ]);

      // Existing auto-cashout semantics (unchanged by H2): a bet settles at
      // the TICK multiplier that crossed its target (min server-derived),
      // not at the target itself — with 50 ms production ticks these are
      // nearly identical. Both sub-crash bets therefore pay at 2.5x here.
      expect(await walletBalance(a.user.id)).toBeCloseTo(aBefore + 5 * 2.5, 2);
      expect(await walletBalance(b.user.id)).toBeCloseTo(bBefore + 5 * 2.5, 2);
      expect(await walletBalance(c.user.id)).toBe(cBefore); // blocked

      const [sa, sb, sc] = await Promise.all([
        prisma.bet.findUniqueOrThrow({ where: { id: a.bet.id } }),
        prisma.bet.findUniqueOrThrow({ where: { id: b.bet.id } }),
        prisma.bet.findUniqueOrThrow({ where: { id: c.bet.id } }),
      ]);
      expect(sa.status).toBe(BetStatus.CASHED_OUT);
      expect(sb.status).toBe(BetStatus.CASHED_OUT);
      expect(sc.status).toBe(BetStatus.ACTIVE);
    } finally {
      await cleanup(a.user.id, a.round.id, a.bet.id);
      await cleanup(b.user.id, b.round.id, b.bet.id);
      await cleanup(c.user.id, c.round.id, c.bet.id);
    }
  });
});
