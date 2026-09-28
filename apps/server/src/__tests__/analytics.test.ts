import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../lib/prisma';
import { eventPipeline, trackEvent } from '../analytics/event-pipeline';
import { FairnessService } from '../game/fairness';
import { MultiplierEngine } from '../game/MultiplierEngine';
import { riskEngine, levelFor } from '../analytics/risk-engine';
import { alertsService, DEFAULT_ALERT_THRESHOLDS } from '../analytics/alerts.service';
import { metricsEngine } from '../analytics/metrics-engine';
import { responsibleGaming } from '../analytics/responsible-gaming';
import { sessionTracker } from '../analytics/session-tracker';
import crypto from 'crypto';

/**
 * ANALYTICS / RISK / FAIRNESS TEST SUITE
 *
 * Critical guarantee under test:
 *   OUTCOME GENERATION IS INDEPENDENT OF PLAYER ACTIVITY.
 *   FairnessService.deriveCrashPoint is a pure function of (seed, roundNumber)
 *   — nothing else can influence it.
 */

const unique = () => `t_${crypto.randomBytes(6).toString('hex')}`;

async function makeUser(withWallet = 1000) {
  const id = unique();
  const user = await prisma.user.create({
    data: {
      id,
      name: `Test ${id}`,
      email: `${id}@test.local`,
      phone: `+251${Math.floor(Math.random() * 9_000_000_00 + 1_000_000_00)}`,
      password: 'x',
    },
  });
  if (withWallet >= 0) {
    await prisma.wallet.create({ data: { userId: user.id, balance: withWallet } });
  }
  return user;
}

async function cleanupUser(id: string) {
  await prisma.activityEvent.deleteMany({ where: { userId: id } });
  await prisma.riskEvent.deleteMany({ where: { userId: id } });
  await prisma.userSession.deleteMany({ where: { userId: id } });
  await prisma.bet.deleteMany({ where: { userId: id } });
  await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: id } } });
  await prisma.wallet.deleteMany({ where: { userId: id } });
  await prisma.deposit.deleteMany({ where: { userId: id } });
  await prisma.withdrawal.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } }).catch(() => undefined);
}

describe('Fairness — outcome independence', () => {
  const svc = new FairnessService();

  it('derives identical crash points for identical (seed, roundNumber)', () => {
    const seed = crypto.randomBytes(16).toString('hex');
    const a = svc.deriveCrashPoint(seed, 12345);
    const b = svc.deriveCrashPoint(seed, 12345);
    expect(a).toBe(b);
  });

  it('derives different crash points for different round numbers (same seed)', () => {
    const seed = crypto.randomBytes(16).toString('hex');
    const values = new Set<number>();
    for (let i = 1; i <= 200; i++) values.add(svc.deriveCrashPoint(seed, i));
    // 200 rounds must produce many distinct outcomes (2-decimal rounding
    // buckets collide for large multipliers; ~4% clamp to the 1.01 floor).
    expect(values.size).toBeGreaterThan(120);
  });

  it('is INDEPENDENT of player activity inputs — the function signature only accepts seed and roundNumber', () => {
    // Structural test: the derive function does not accept user/balance/bet
    // parameters, so player state cannot influence outcomes by construction.
    const fn = svc.deriveCrashPoint;
    expect(fn.length).toBeLessThanOrEqual(3); // (serverSeed, roundNumber, [houseEdge])
  });

  it('produces outcomes in the house-edge distribution', () => {
    const seed = crypto.randomBytes(16).toString('hex');
    let reach2x = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      if (svc.deriveCrashPoint(seed, i) >= 2) reach2x++;
    }
    // P(crash >= 2) = (1 - 0.03) / 2 ≈ 48.5% → allow wide bounds
    const ratio = reach2x / N;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.57);
  });

  it('commit/reveal round-trip verifies', async () => {
    const roundNumber = Math.floor(Math.random() * 1_000_000);
    const { crashPoint, serverSeedHash } = await svc.beginRound(roundNumber);
    const round = await prisma.gameRound.findFirst({ where: { roundNumber } });
    const seedRevealed = svc.ensureSeed().seed;
    // Simulate the reveal path verification
    const result = svc.verifyRound({
      roundNumber,
      crashPoint,
      serverSeed: seedRevealed,
      serverSeedHash,
    });
    expect(result.valid).toBe(true);
    expect(result.crashPoint).toBe(crashPoint);
  });

  it('verification FAILS when the seed does not match the commit', () => {
    const result = svc.verifyRound({
      roundNumber: 1,
      crashPoint: 2.5,
      serverSeed: 'deadbeef',
      serverSeedHash: '0000000000000000000000000000000000000000000000000000000000000000',
    });
    expect(result.valid).toBe(false);
    expect(result.detail).toContain('mismatch');
  });

  it('verification FAILS when the recorded crash point was tampered with', () => {
    const seed = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    const real = new FairnessService().deriveCrashPoint(seed, 777);
    const result = svc.verifyRound({
      roundNumber: 777,
      crashPoint: real + 10, // tampered
      serverSeed: seed,
      serverSeedHash: hash,
    });
    expect(result.valid).toBe(false);
    expect(result.detail).toContain('Recomputed');
  });
});

describe('MultiplierEngine — no outcome leakage', () => {
  const engine = new MultiplierEngine();

  it('multiplier depends ONLY on elapsed time (identical input → identical output)', () => {
    const t = 12_345;
    expect(engine.calculateMultiplier(t)).toBe(engine.calculateMultiplier(t));
    expect(engine.calculateMultiplier(t)).toBeGreaterThan(1);
  });

  it('never takes crashPoint as an input — curve shape cannot reveal the outcome', () => {
    expect(engine.calculateMultiplier.length).toBeLessThanOrEqual(1);
    expect(engine.calculateCashoutMultiplier.length).toBeLessThanOrEqual(1);
  });

  it('grows monotonically', () => {
    let prev = engine.calculateMultiplier(0);
    for (let t = 500; t <= 30_000; t += 500) {
      const m = engine.calculateMultiplier(t);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });
});

describe('Event pipeline', () => {
  it('persists tracked events after flush', async () => {
    const user = await makeUser(0);
    try {
      trackEvent({ eventType: 'BET_PLACED', userId: user.id, amount: '50', metadata: { test: true } });
      trackEvent({ eventType: 'BET_LOST', userId: user.id, amount: '50' });
      await eventPipeline.flush();
      const events = await prisma.activityEvent.findMany({ where: { userId: user.id } });
      expect(events.length).toBe(2);
      expect(events.every((e) => e.serverTs instanceof Date)).toBe(true);
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('does not throw when tracking invalid payloads (failure isolation)', () => {
    expect(() => trackEvent({ eventType: 'BET_PLACED', metadata: { circular: undefined as any } })).not.toThrow();
  });

  it('queue depth drains after shutdown', async () => {
    for (let i = 0; i < 30; i++) trackEvent({ eventType: 'ROUND_STARTED' });
    await eventPipeline.shutdown();
    expect(eventPipeline.getQueueDepth()).toBe(0);
  });
});

describe('Risk engine', () => {
  it('levels map to scores correctly', () => {
    expect(levelFor(5)).toBe('LOW');
    expect(levelFor(30)).toBe('MEDIUM');
    expect(levelFor(60)).toBe('HIGH');
    expect(levelFor(90)).toBe('CRITICAL');
  });

  it('normal user scores LOW', async () => {
    const user = await makeUser(1000);
    try {
      const a = await riskEngine.assessUser(user.id);
      expect(a.level).toBe('LOW');
      expect(a.score).toBe(0);
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('flags abnormal withdrawal frequency as a triggered signal', async () => {
    const user = await makeUser(10000);
    try {
      const recent = new Date(Date.now() - 60 * 60_000); // 1h ago — safely inside the 24h window
      for (let i = 0; i < 10; i++) {
        await prisma.withdrawal.create({
          data: {
            userId: user.id,
            amount: 100,
            paymentMethod: 'TELEBIRR',
            accountNumber: '0911',
            status: 'PENDING',
            createdAt: recent,
          },
        });
      }
      const a = await riskEngine.assessUser(user.id);
      const signal = a.signals.find((s) => s.code === 'ABNORMAL_WITHDRAWAL_FREQUENCY');
      expect(signal?.triggered).toBe(true);
      expect(a.reasons.some((r) => r.includes('ABNORMAL_WITHDRAWAL_FREQUENCY'))).toBe(true);
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('detects bot-like metronomic timing', async () => {
    const user = await makeUser(10000);
    const rounds: string[] = [];
    try {
      // 8 rounds × 2 slots = 16 bets at EXACTLY 2000ms intervals — metronomic.
      // (Bet uniqueness is (userId, roundId, slot), so spread across rounds.)
      const base = Date.now() - 60_000;
      let n = 0;
      for (let r = 0; r < 8; r++) {
        const round = await prisma.gameRound.create({
          data: { roundNumber: Math.floor(Math.random() * 1_000_000) + r, phase: 'SETTLED', crashPoint: 2 },
        });
        rounds.push(round.id);
        for (const slot of [1, 2] as const) {
          await prisma.bet.create({
            data: {
              userId: user.id,
              roundId: round.id,
              slot,
              amount: 10,
              status: 'LOST',
              placedAt: new Date(base + n * 2000),
            },
          });
          n++;
        }
      }
      const a = await riskEngine.assessUser(user.id);
      const signal = a.signals.find((s) => s.code === 'BOT_LIKE_TIMING');
      expect(signal?.triggered).toBe(true);
    } finally {
      await prisma.bet.deleteMany({ where: { roundId: { in: rounds } } });
      await prisma.gameRound.deleteMany({ where: { id: { in: rounds } } });
      await cleanupUser(user.id);
    }
  });

  it('assessAndRecord persists a RiskEvent only at MEDIUM+', async () => {
    const user = await makeUser(10000);
    try {
      const recent = new Date(Date.now() - 60 * 60_000); // 1h ago — safely inside the window
      for (let i = 0; i < 12; i++) {
        await prisma.withdrawal.create({
          data: {
            userId: user.id,
            amount: 100,
            paymentMethod: 'TELEBIRR',
            accountNumber: '0911',
            status: 'PENDING',
            createdAt: recent,
          },
        });
      }
      const a = await riskEngine.assessAndRecord(user.id, { test: true });
      expect(['MEDIUM', 'HIGH', 'CRITICAL']).toContain(a.level);
      const stored = await prisma.riskEvent.findFirst({ where: { userId: user.id } });
      expect(stored).not.toBeNull();
      const reasons = JSON.parse(stored!.reasons);
      expect(Array.isArray(reasons)).toBe(true);
      expect(reasons.length).toBeGreaterThan(0);
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('failed-login signal fires after repeated AUTH_FAILED_LOGIN events', async () => {
    const user = await makeUser(0);
    try {
      const recent = new Date(Date.now() - 30 * 60_000); // 30 min ago — safely inside the 1h window
      for (let i = 0; i < 12; i++) {
        await prisma.activityEvent.create({
          data: { eventType: 'AUTH_FAILED_LOGIN', userId: user.id, serverTs: recent },
        });
      }
      const a = await riskEngine.assessUser(user.id);
      const signal = a.signals.find((s) => s.code === 'REPEATED_FAILED_AUTH');
      expect(signal?.triggered).toBe(true);
    } finally {
      await cleanupUser(user.id);
    }
  });
});

describe('Alerts service', () => {
  it('deduplicates alerts with the same dedupeKey', async () => {
    const key = `test:${crypto.randomBytes(6).toString('hex')}`;
    try {
      await alertsService.raise({
        dedupeKey: key,
        category: 'SYSTEM',
        severity: 'WARNING',
        title: 'Test alert',
        message: 'first',
      });
      await alertsService.raise({
        dedupeKey: key,
        category: 'SYSTEM',
        severity: 'WARNING',
        title: 'Test alert',
        message: 'second',
      });
      const rows = await prisma.adminAlert.findMany({ where: { dedupeKey: key } });
      expect(rows.length).toBe(1);
      expect(rows[0].message).toBe('second'); // refreshed, not duplicated
    } finally {
      await prisma.adminAlert.deleteMany({ where: { dedupeKey: key } });
    }
  });

  it('creates a fresh alert when the previous one was resolved (recurrence)', async () => {
    const key = `test:${crypto.randomBytes(6).toString('hex')}`;
    try {
      await alertsService.raise({ dedupeKey: key, category: 'SYSTEM', severity: 'INFO', title: 'A', message: '1' });
      await prisma.adminAlert.update({ where: { dedupeKey: key }, data: { isResolved: true } });
      await alertsService.raise({ dedupeKey: key, category: 'SYSTEM', severity: 'INFO', title: 'A', message: '2' });
      const rows = await prisma.adminAlert.findMany({ where: { dedupeKey: key } });
      expect(rows.length).toBe(1);
      expect(rows[0].isResolved).toBe(false);
      expect(rows[0].message).toBe('2');
    } finally {
      await prisma.adminAlert.deleteMany({ where: { dedupeKey: key } });
    }
  });

  it('thresholds round-trip through SystemSetting', async () => {
    const updated = await alertsService.updateThresholds({ maxSessionMinutes: 111 }, 'test-admin');
    expect(updated.maxSessionMinutes).toBe(111);
    const fetched = await alertsService.getThresholds();
    expect(fetched.maxSessionMinutes).toBe(111);
    // restore default
    await alertsService.updateThresholds({ maxSessionMinutes: DEFAULT_ALERT_THRESHOLDS.maxSessionMinutes }, 'test-admin');
  });
});

describe('Responsible gaming', () => {
  it('flags high deposit frequency (>=5 approved deposits/24h)', async () => {
    const user = await makeUser(0);
    const key = `rg:deposit:freq:${user.id}`;
    try {
      const now = new Date();
      for (let i = 0; i < 5; i++) {
        await prisma.deposit.create({
          data: {
            userId: user.id,
            submittedAmount: 500,
            verifiedAmount: 500,
            paymentMethod: 'TELEBIRR',
            status: 'APPROVED',
            processedAt: now,
          },
        });
      }
      await responsibleGaming.checkDepositEscalation(user.id, 500);
      const alert = await prisma.adminAlert.findUnique({ where: { dedupeKey: key } });
      expect(alert).not.toBeNull();
      expect(alert!.category).toBe('RESPONSIBLE_GAMING');
    } finally {
      await prisma.adminAlert.deleteMany({ where: { dedupeKey: key } });
      await cleanupUser(user.id);
    }
  });

  it('does NOT flag a normal single deposit', async () => {
    const user = await makeUser(0);
    const key = `rg:deposit:freq:${user.id}`;
    try {
      await prisma.deposit.create({
        data: {
          userId: user.id,
          submittedAmount: 500,
          verifiedAmount: 500,
          paymentMethod: 'TELEBIRR',
          status: 'APPROVED',
          processedAt: new Date(),
        },
      });
      await responsibleGaming.checkDepositEscalation(user.id, 500);
      const alert = await prisma.adminAlert.findUnique({ where: { dedupeKey: key } });
      expect(alert).toBeNull();
    } finally {
      await prisma.adminAlert.deleteMany({ where: { dedupeKey: key } });
      await cleanupUser(user.id);
    }
  });
});

describe('Session tracker', () => {
  it('online count reflects distinct users, not sockets', async () => {
    const u1 = await makeUser(0);
    const u2 = await makeUser(0);
    const before = sessionTracker.getOnlineCount();
    await sessionTracker.startSession(u1.id, 'sock-a');
    await sessionTracker.startSession(u1.id, 'sock-b'); // same user, 2 tabs
    await sessionTracker.startSession(u2.id, 'sock-c');
    const after = sessionTracker.getOnlineCount();
    expect(after - before).toBe(2); // 2 distinct users, 3 sockets
    expect(sessionTracker.getActiveSocketCount() - (before >= 0 ? 0 : 0)).toBeGreaterThanOrEqual(3);
    await sessionTracker.endSession('sock-a');
    await sessionTracker.endSession('sock-b');
    await sessionTracker.endSession('sock-c');
    expect(sessionTracker.getOnlineCount()).toBe(before);
    await cleanupUser(u1.id);
    await cleanupUser(u2.id);
  });

  it('ends sessions with a reason', async () => {
    const u = await makeUser(0);
    const sid = await sessionTracker.startSession(u.id, 'sock-end');
    await sessionTracker.endSession('sock-end', 'LOGOUT');
    const row = await prisma.userSession.findUnique({ where: { id: sid } });
    expect(row?.endedAt).not.toBeNull();
    expect(row?.endReason).toBe('LOGOUT');
    await cleanupUser(u.id);
  });
});

describe('Metrics engine', () => {
  it('records latency percentiles', () => {
    for (let i = 1; i <= 100; i++) metricsEngine.recordLatency(i);
    const p = metricsEngine.latencyPercentiles();
    expect(p.p50).toBeGreaterThan(0);
    expect(p.p95).toBeGreaterThanOrEqual(p.p50);
    expect(p.p99).toBeGreaterThanOrEqual(p.p95);
  });

  it('retention deletes old analytics rows but NEVER financial records', async () => {
    const user = await makeUser(0);
    try {
      const old = new Date(Date.now() - 91 * 24 * 60 * 60_000);
      await prisma.activityEvent.create({ data: { eventType: 'BET_PLACED', userId: user.id, serverTs: old } });
      await prisma.activityEvent.create({ data: { eventType: 'BET_PLACED', userId: user.id, serverTs: new Date() } });
      // old wallet transaction that MUST survive retention
      const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      const tx = await prisma.walletTransaction.create({
        data: {
          walletId: wallet!.id,
          type: 'DEPOSIT',
          amount: 100,
          balanceBefore: 0,
          balanceAfter: 100,
          description: 'retention-survivor',
          createdAt: old,
          updatedAt: old,
        },
      });
      await metricsEngine.runRetention();
      const events = await prisma.activityEvent.findMany({ where: { userId: user.id } });
      expect(events.length).toBe(1); // only the recent event survives
      const survivor = await prisma.walletTransaction.findUnique({ where: { id: tx.id } });
      expect(survivor).not.toBeNull(); // financial ledger untouched
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('dashboard payload returns real aggregates', async () => {
    const payload = await metricsEngine.getDashboardPayload();
    expect(typeof payload.totalUsers).toBe('number');
    expect(payload.totalUsers).toBeGreaterThan(0);
    expect(typeof payload.wagered24h).toBe('number');
    expect(typeof payload.onlineUsers).toBe('number');
  });
});

describe('Adversarial — analytics cannot mutate financial state', () => {
  it('risk assessment never changes a wallet', async () => {
    const user = await makeUser(750);
    try {
      const before = await prisma.wallet.findUnique({ where: { userId: user.id } });
      await riskEngine.assessAndRecord(user.id);
      await metricsEngine.getDashboardPayload();
      const after = await prisma.wallet.findUnique({ where: { userId: user.id } });
      expect(Number(after!.balance)).toBe(Number(before!.balance));
      expect(Number(after!.reserved)).toBe(Number(before!.reserved));
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('event tracking never changes a wallet', async () => {
    const user = await makeUser(432.1);
    try {
      const before = await prisma.wallet.findUnique({ where: { userId: user.id } });
      trackEvent({ eventType: 'DEPOSIT_APPROVED', userId: user.id, amount: '999999' });
      await eventPipeline.flush();
      const after = await prisma.wallet.findUnique({ where: { userId: user.id } });
      expect(Number(after!.balance)).toBe(Number(before!.balance));
    } finally {
      await cleanupUser(user.id);
    }
  });

  it('responsible-gaming checks never change a wallet or game round', async () => {
    const user = await makeUser(100);
    try {
      const round = await prisma.gameRound.create({
        data: { roundNumber: Math.floor(Math.random() * 1_000_000), phase: 'SETTLED', crashPoint: 3.33 },
      });
      const beforeW = await prisma.wallet.findUnique({ where: { userId: user.id } });
      const beforeR = await prisma.gameRound.findUnique({ where: { id: round.id } });
      await responsibleGaming.checkLossChasing(user.id);
      await responsibleGaming.checkPlayFrequency(user.id);
      await responsibleGaming.checkSession('nonexistent-session');
      const afterW = await prisma.wallet.findUnique({ where: { userId: user.id } });
      const afterR = await prisma.gameRound.findUnique({ where: { id: round.id } });
      expect(Number(afterW!.balance)).toBe(Number(beforeW!.balance));
      expect(Number(afterR!.crashPoint)).toBe(Number(beforeR!.crashPoint));
      await prisma.gameRound.delete({ where: { id: round.id } });
    } finally {
      await cleanupUser(user.id);
    }
  });
});
