import prisma from '../lib/prisma';
import { alertsService } from './alerts.service';

/**
 * RESPONSIBLE-GAMING MONITOR.
 *
 * Prioritizes player safety. Detects patterns and raises alerts/interventions
 * for review. It NEVER changes game outcomes, never blocks bets, and never
 * moves money. Interventions are notifications + admin alert rows.
 */

export class ResponsibleGamingService {
  /** Long/night session check — runs on a schedule per active session. */
  async checkSession(sessionId: string): Promise<void> {
    try {
      const session = await prisma.userSession.findUnique({
        where: { id: sessionId },
        select: {
          id: true, userId: true, startedAt: true, lastActivityAt: true,
          totalWagered: true, totalPayout: true, endedAt: true,
        },
      });
      if (!session || session.endedAt) return;

      const minutes = (Date.now() - new Date(session.startedAt).getTime()) / 60_000;
      const thresholds = await alertsService.getThresholds();

      if (minutes >= thresholds.maxSessionMinutes) {
        const startedHour = new Date(session.startedAt).getHours();
        const nightSession = startedHour >= 23 || startedHour <= 5;
        await alertsService.raiseIfExceeded({
          dedupeKey: `rg:session:${sessionId}`,
          category: 'RESPONSIBLE_GAMING',
          severity: nightSession ? 'HIGH' : 'WARNING',
          title: nightSession ? 'Night-long session detected' : 'Very long session detected',
          message: `User ${session.userId} session running ${Math.round(minutes)} min (${nightSession ? 'overnight' : 'long'}). Consider a session-time reminder.`,
          linkType: 'USER',
          linkId: session.userId,
          metadata: { sessionId, minutes: Math.round(minutes), nightSession },
        });
      }
    } catch {
      /* monitoring must never throw */
    }
  }

  /** Rapid deposit escalation — many deposits / rising amounts in 24h. */
  async checkDepositEscalation(userId: string, newAmount: number): Promise<void> {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60_000);
      const deposits = await prisma.deposit.findMany({
        where: { userId, status: 'APPROVED', processedAt: { gte: since } },
        select: { verifiedAmount: true },
        orderBy: { processedAt: 'asc' },
      });

      const total = deposits.reduce((a, d) => a + Number(d.verifiedAmount), 0);
      const thresholds = await alertsService.getThresholds();

      // Frequency: >= 5 approved deposits in 24h
      if (deposits.length >= 5) {
        await alertsService.raiseIfExceeded({
          dedupeKey: `rg:deposit:freq:${userId}`,
          category: 'RESPONSIBLE_GAMING',
          severity: 'WARNING',
          title: 'High deposit frequency',
          message: `User ${userId} made ${deposits.length} approved deposits in 24h (total ${total.toFixed(2)} ETB).`,
          linkType: 'USER',
          linkId: userId,
          metadata: { count24h: deposits.length, total },
        });
      }

      // Escalation: last amount >= 3x median of the window
      if (deposits.length >= 3) {
        const amounts = deposits.map((d) => Number(d.verifiedAmount)).sort((a, b) => a - b);
        const median = amounts[Math.floor(amounts.length / 2)];
        if (newAmount >= median * 3 && newAmount > 1000) {
          await alertsService.raiseIfExceeded({
            dedupeKey: `rg:deposit:escalation:${userId}`,
            category: 'RESPONSIBLE_GAMING',
            severity: 'WARNING',
            title: 'Deposit escalation pattern',
            message: `User ${userId} latest deposit ${newAmount} ETB is ≥3× their 24h median (${median} ETB).`,
            linkType: 'USER',
            linkId: userId,
            metadata: { newAmount, median },
          });
        }
      }
    } catch {
      /* monitoring must never throw */
    }
  }

  /**
   * Loss-chasing: repeated losses immediately followed by deposits, or
   * high-frequency play after losing streaks.
   */
  async checkLossChasing(userId: string): Promise<void> {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60_000);
      // Money lost in the window
      const lostAgg = await prisma.bet.aggregate({
        where: { userId, status: 'LOST', createdAt: { gte: since } },
        _count: true,
        _sum: { amount: true },
      });
      const lostCount = lostAgg._count ?? 0;
      const lostSum = Number(lostAgg._sum.amount ?? 0);

      if (lostCount >= 25 && lostSum >= 2000) {
        // Deposits right after the losses?
        const depositsAfter = await prisma.deposit.count({
          where: { userId, createdAt: { gte: since } },
        });
        if (depositsAfter >= 3) {
          await alertsService.raiseIfExceeded({
            dedupeKey: `rg:chasing:${userId}`,
            category: 'RESPONSIBLE_GAMING',
            severity: 'HIGH',
            title: 'Possible loss-chasing behavior',
            message: `User ${userId}: ${lostCount} losing bets (${lostSum.toFixed(0)} ETB) followed by ${depositsAfter} deposits in 24h. Recommend a cool-off review.`,
            linkType: 'USER',
            linkId: userId,
            metadata: { lostCount, lostSum, depositsAfter },
          });
        }
      }
    } catch {
      /* monitoring must never throw */
    }
  }

  /** High-frequency play: excessive bets per hour. */
  async checkPlayFrequency(userId: string): Promise<void> {
    try {
      const since = new Date(Date.now() - 60 * 60_000);
      const bets = await prisma.bet.count({ where: { userId, createdAt: { gte: since } } });
      if (bets >= 150) {
        await alertsService.raiseIfExceeded({
          dedupeKey: `rg:freq:${userId}`,
          category: 'RESPONSIBLE_GAMING',
          severity: 'WARNING',
          title: 'High-frequency play',
          message: `User ${userId} placed ${bets} bets in the last hour.`,
          linkType: 'USER',
          linkId: userId,
          metadata: { betsLastHour: bets },
        });
      }
    } catch {
      /* monitoring must never throw */
    }
  }
}

export const responsibleGaming = new ResponsibleGamingService();
