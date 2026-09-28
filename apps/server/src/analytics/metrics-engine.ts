import prisma from '../lib/prisma';
import { realtimeBridge } from './realtime-bridge';
import { sessionTracker } from './session-tracker';
import { eventPipeline } from './event-pipeline';
import { alertsService, DEFAULT_ALERT_THRESHOLDS } from './alerts.service';
import { GAME_CONSTANTS } from '../../shared/types';

/**
 * PLATFORM METRICS + FINANCIAL RISK MONITORING + SYSTEM HEALTH.
 *
 * Two cadences:
 *  - "hot" in-memory counters (bets/sec, tx/sec, cashouts/sec) updated on
 *    each event — O(1), no DB scans — broadcast to admins every 5 s.
 *  - "cold" DB aggregation every 60 s: platform KPIs, financial exposure,
 *    threshold checks, PlatformMetricSnapshot persistence, retention.
 *
 * All values are derived from the real database / live counters. No mocks.
 */

interface HotCounters {
  betsWindow: number[];
  txWindow: number[];
  cashoutsWindow: number[];
  lastSweep: number;
}

class MetricsEngine {
  private counters: HotCounters = { betsWindow: [], txWindow: [], cashoutsWindow: [], lastSweep: 0 };
  private slowInterval: NodeJS.Timeout | null = null;
  private hotInterval: NodeJS.Timeout | null = null;
  private started = false;

  // latency percentiles (ms) of financial ops, recorded by the routes
  private latencies: number[] = [];

  recordLatency(ms: number): void {
    try {
      this.latencies.push(ms);
      if (this.latencies.length > 2000) this.latencies.splice(0, 1000);
    } catch { /* ignore */ }
  }

  latencyPercentiles(): { p50: number; p95: number; p99: number } {
    const arr = [...this.latencies].sort((a, b) => a - b);
    const pick = (p: number) => arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : 0;
    return { p50: pick(50), p95: pick(95), p99: pick(99) };
  }

  private pushWindow(win: number[], now = Date.now()): void {
    win.push(now);
    // keep only last 10 s
    while (win.length && now - win[0] > 10_000) win.shift();
  }

  onBetPlaced(): void { this.pushWindow(this.counters.betsWindow); }
  onCashout(): void { this.pushWindow(this.counters.cashoutsWindow); }
  onTransaction(): void { this.pushWindow(this.counters.txWindow); }

  private perSecond(win: number[]): number {
    const now = Date.now();
    while (win.length && now - win[0] > 10_000) win.shift();
    return Math.round((win.length / 10) * 10) / 10;
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    // Hot broadcast every 5 s (cheap, in-memory only)
    this.hotInterval = setInterval(() => {
      try {
        realtimeBridge.toAdmin('admin:metrics', {
          type: 'hot',
          betsPerSecond: this.perSecond(this.counters.betsWindow),
          cashoutsPerSecond: this.perSecond(this.counters.cashoutsWindow),
          transactionsPerSecond: this.perSecond(this.counters.txWindow),
          onlineUsers: sessionTracker.getOnlineCount(),
          activeSockets: sessionTracker.getActiveSocketCount(),
          eventQueueDepth: eventPipeline.getQueueDepth(),
          latency: this.latencyPercentiles(),
        });
      } catch { /* ignore */ }
    }, 5_000);

    // Cold aggregation every 60 s
    this.slowInterval = setInterval(() => {
      void this.slowTick().catch((e) => console.error('[METRICS] slowTick:', e.message));
    }, 60_000);
  }

  stop(): void {
    if (this.hotInterval) clearInterval(this.hotInterval);
    if (this.slowInterval) clearInterval(this.slowInterval);
    this.started = false;
  }

  /** Cold aggregation + threshold alerts + snapshot persistence. */
  async slowTick(): Promise<void> {
    const [pendingDeposits, pendingWithdrawals, walletAgg, roundPlayers, openRisk] = await Promise.all([
      prisma.deposit.count({ where: { status: 'PENDING' } }),
      prisma.withdrawal.count({ where: { status: 'PENDING' } }),
      prisma.wallet.aggregate({ _sum: { balance: true, reserved: true }, _count: true }),
      sessionTracker.getActiveSocketCount(),
      prisma.riskEvent.count({ where: { status: 'OPEN' } }),
    ]);

    const walletLiability = Number(walletAgg._sum.balance ?? 0);
    const reservedFunds = Number(walletAgg._sum.reserved ?? 0);
    const pendingWithdrawalValue = await prisma.withdrawal.aggregate({
      where: { status: 'PENDING' },
      _sum: { amount: true },
    }).then((r) => Number(r._sum.amount ?? 0));

    // 24h volumes (indexed createdAt scans on financial tables — bounded)
    const day = new Date(Date.now() - 24 * 60 * 60_000);
    const [wagered24, payouts24, deposits24, withdrawals24, bets24h, totalUsers] = await Promise.all([
      prisma.bet.aggregate({ where: { createdAt: { gte: day } }, _sum: { amount: true }, _count: true }),
      prisma.bet.aggregate({ where: { status: 'CASHED_OUT', updatedAt: { gte: day } }, _sum: { payout: true }, _count: true }),
      prisma.deposit.aggregate({ where: { status: 'APPROVED', processedAt: { gte: day } }, _sum: { verifiedAmount: true }, _count: true }),
      prisma.withdrawal.aggregate({ where: { status: 'APPROVED', processedAt: { gte: day } }, _sum: { amount: true }, _count: true }),
      prisma.bet.count({ where: { createdAt: { gte: day } } }),
      prisma.user.count(),
    ]);

    // ---- threshold-driven alerts (financial/system) ----
    const th = await alertsService.getThresholds();
    if (pendingWithdrawals > th.maxPendingWithdrawals) {
      await alertsService.raiseIfExceeded({
        dedupeKey: 'fin:pending_withdrawals',
        category: 'FINANCIAL',
        severity: 'WARNING',
        title: 'High pending withdrawal count',
        message: `${pendingWithdrawals} withdrawals pending (threshold ${th.maxPendingWithdrawals}).`,
        metadata: { pendingWithdrawals },
      });
    }
    if (pendingWithdrawalValue > th.maxPendingWithdrawalValue) {
      await alertsService.raiseIfExceeded({
        dedupeKey: 'fin:pending_withdrawal_value',
        category: 'FINANCIAL',
        severity: 'HIGH',
        title: 'High pending withdrawal value',
        message: `${pendingWithdrawalValue.toFixed(0)} ETB in pending withdrawals (threshold ${th.maxPendingWithdrawalValue}).`,
        metadata: { pendingWithdrawalValue },
      });
    }
    if (walletLiability > th.maxWalletLiability) {
      await alertsService.raiseIfExceeded({
        dedupeKey: 'fin:wallet_liability',
        category: 'FINANCIAL',
        severity: 'WARNING',
        title: 'Wallet liability high',
        message: `Total user balances ${walletLiability.toFixed(0)} ETB (threshold ${th.maxWalletLiability}).`,
        metadata: { walletLiability },
      });
    }
    if (openRisk > th.maxRiskEventsOpen) {
      await alertsService.raiseIfExceeded({
        dedupeKey: 'fraud:open_risk_events',
        category: 'FRAUD',
        severity: 'WARNING',
        title: 'Open risk events backlog',
        message: `${openRisk} risk events awaiting review (threshold ${th.maxRiskEventsOpen}).`,
        metadata: { openRisk },
      });
    }
    if (eventPipeline.getQueueDepth() > th.maxEventQueueDepth) {
      await alertsService.raiseIfExceeded({
        dedupeKey: 'sys:event_queue',
        category: 'SYSTEM',
        severity: 'WARNING',
        title: 'Analytics event backlog',
        message: `Event pipeline queue depth ${eventPipeline.getQueueDepth()} (threshold ${th.maxEventQueueDepth}).`,
        metadata: { queueDepth: eventPipeline.getQueueDepth() },
      });
    }
    const lat = this.latencyPercentiles();
    if (lat.p99 > 3000) {
      await alertsService.raiseIfExceeded({
        dedupeKey: 'sys:latency_p99',
        category: 'SYSTEM',
        severity: 'WARNING',
        title: 'High p99 latency',
        message: `Financial op p99 at ${Math.round(lat.p99)} ms (threshold 3000 ms).`,
        metadata: lat,
      });
    }

    // ---- session sweep + responsible-gaming scan for active sessions ----
    const swept = await sessionTracker.sweepStale(60);
    if (swept > 0) {
      await alertsService.raiseIfExceeded({
        dedupeKey: 'sys:stale_sessions',
        category: 'SYSTEM',
        severity: 'INFO',
        title: 'Stale sessions swept',
        message: `${swept} idle sessions (>60 min) closed by the sweeper.`,
        metadata: { swept },
      });
    }

    // ---- persist snapshot ----
    await prisma.platformMetricSnapshot.create({
      data: {
        onlineUsers: sessionTracker.getOnlineCount(),
        activeSessions: sessionTracker.getActiveSessionIds().length,
        currentRoundPlayers: roundPlayers,
        totalWagered: String(wagered24._sum.amount ?? 0),
        totalPayout: String(payouts24._sum.payout ?? 0),
        betsPerSecond: String(this.perSecond(this.counters.betsWindow)),
        pendingDeposits,
        pendingWithdrawals,
        walletLiability: String(walletLiability),
        reservedFunds: String(reservedFunds),
        metadata: JSON.stringify({
          latency: lat,
          bets24h: bets24h,
          deposits24: deposits24._count,
          withdrawals24: withdrawals24._count,
          totalUsers,
          eventQueueDepth: eventPipeline.getQueueDepth(),
        }),
      },
    });

    // ---- retention (24h+ snapshots beyond 7 days; ActivityEvents beyond 90 days) ----
    await this.runRetention();
  }

  /** Retention: analytics data is trimmed; financial records are NEVER touched. */
  async runRetention(): Promise<{ snapshots: number; events: number }> {
    try {
      const snapCutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000);
      const evtCutoff = new Date(Date.now() - 90 * 24 * 60 * 60_000);
      const [snapshots, events] = await Promise.all([
        prisma.platformMetricSnapshot.deleteMany({ where: { capturedAt: { lt: snapCutoff } } }),
        prisma.activityEvent.deleteMany({ where: { serverTs: { lt: evtCutoff } } }),
      ]);
      return { snapshots: snapshots.count, events: events.count };
    } catch {
      return { snapshots: 0, events: 0 };
    }
  }

  /**
   * Full analytics dashboard payload (cold values). Admin-only.
   * Uses indexed aggregates — no unbounded scans.
   */
  async getDashboardPayload() {
    const day = new Date(Date.now() - 24 * 60 * 60_000);
    const [totalUsers, activeUsers24, pendingDeposits, pendingWithdrawals, walletAgg] = await Promise.all([
      prisma.user.count(),
      prisma.userSession.findMany({
        where: { startedAt: { gte: day } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.deposit.count({ where: { status: 'PENDING' } }),
      prisma.withdrawal.count({ where: { status: 'PENDING' } }),
      prisma.wallet.aggregate({ _sum: { balance: true, reserved: true } }),
    ]);

    const [bets24, wagered24, payouts24, deposits24, withdrawals24] = await Promise.all([
      prisma.bet.count({ where: { createdAt: { gte: day } } }),
      prisma.bet.aggregate({ where: { createdAt: { gte: day } }, _sum: { amount: true } }),
      prisma.bet.aggregate({ where: { status: 'CASHED_OUT', updatedAt: { gte: day } }, _sum: { payout: true } }),
      prisma.deposit.aggregate({ where: { status: 'APPROVED', processedAt: { gte: day } }, _sum: { verifiedAmount: true } }),
      prisma.withdrawal.aggregate({ where: { status: 'APPROVED', processedAt: { gte: day } }, _sum: { amount: true } }),
    ]);

    const [openRiskEvents, unresolvedAlerts] = await Promise.all([
      prisma.riskEvent.count({ where: { status: 'OPEN' } }),
      prisma.adminAlert.count({ where: { isResolved: false } }),
    ]);

    const wagered = Number(wagered24._sum.amount ?? 0);
    const payout = Number(payouts24._sum.payout ?? 0);
    const avgBet = bets24 > 0 ? wagered / bets24 : 0;

    return {
      totalUsers,
      activeUsers24h: activeUsers24.length,
      onlineUsers: sessionTracker.getOnlineCount(),
      pendingDeposits,
      pendingWithdrawals,
      walletLiability: Number(walletAgg._sum.balance ?? 0),
      reservedFunds: Number(walletAgg._sum.reserved ?? 0),
      bets24h: bets24,
      wagered24h: wagered,
      payouts24h: payout,
      deposits24h: Number(deposits24._sum.verifiedAmount ?? 0),
      withdrawals24h: Number(withdrawals24._sum.amount ?? 0),
      avgBet24h: Math.round(avgBet * 100) / 100,
      ggr24h: Math.round((wagered - payout) * 100) / 100,
      openRiskEvents,
      unresolvedAlerts,
      eventQueueDepth: eventPipeline.getQueueDepth(),
      latency: this.latencyPercentiles(),
    };
  }
}

export const metricsEngine = new MetricsEngine();
