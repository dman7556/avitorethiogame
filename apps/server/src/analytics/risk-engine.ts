import prisma from '../lib/prisma';
import { trackEvent } from './event-pipeline';
import { alertsService } from './alerts.service';

/**
 * RISK / FRAUD DETECTION ENGINE.
 *
 * OBSERVE ≠ MANIPULATE: every function here is read-only with respect to
 * wallet balances and game rounds. The engine can only WRITE RiskEvent rows
 * and AdminAlerts. Nothing in this file can move money or touch GameRound.
 *
 * Methodology: multiple independent signals, each contributing 0-100,
 * combined into a composite risk score with EXPLAINABLE reasons. No single
 * signal alone escalates a user. High scores FLAG FOR REVIEW — they never
 * silently punish (no balance freeze, no bet rejection, no outcome change).
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskSignal {
  code: string;
  weight: number; // contribution to score if triggered
  detail: string;
  triggered: boolean;
}

export interface RiskAssessment {
  userId: string;
  score: number;
  level: RiskLevel;
  signals: RiskSignal[];
  reasons: string[];
}

export function levelFor(score: number): RiskLevel {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

export class RiskEngine {
  // ---- individual signals ----------------------------------------------

  /** S1: transaction velocity in the last hour (bets+deposits+withdrawals). */
  private async velocitySignal(userId: string): Promise<RiskSignal> {
    const since = new Date(Date.now() - 60 * 60_000);
    const [bets, deposits, withdrawals] = await Promise.all([
      prisma.bet.count({ where: { userId, createdAt: { gte: since } } }),
      prisma.deposit.count({ where: { userId, createdAt: { gte: since } } }),
      prisma.withdrawal.count({ where: { userId, createdAt: { gte: since } } }),
    ]);
    const txCount = bets + deposits + withdrawals;
    const triggered = txCount > 120;
    return {
      code: 'UNUSUAL_TRANSACTION_VELOCITY',
      weight: triggered ? Math.min(40, 10 + Math.floor((txCount - 120) / 10) * 2) : 0,
      detail: `${txCount} transactions in the last hour`,
      triggered,
    };
  }

  /** S2: rapid deposit → bet → withdrawal cycling (payment abuse pattern). */
  private async cycleSignal(userId: string): Promise<RiskSignal> {
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const deposits = await prisma.deposit.findMany({
      where: { userId, status: 'APPROVED', processedAt: { gte: since } },
      select: { processedAt: true, verifiedAmount: true },
      orderBy: { processedAt: 'desc' },
      take: 10,
    });
    const withdrawals = await prisma.withdrawal.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { createdAt: true, amount: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Count deposits whose funds were withdrawn within 10 minutes of approval.
    let cycles = 0;
    for (const d of deposits) {
      const at = d.processedAt?.getTime() ?? 0;
      if (!at) continue;
      const quickW = withdrawals.find((w) => {
        const t = w.createdAt.getTime();
        return t >= at && t - at < 10 * 60_000;
      });
      if (quickW) cycles++;
    }
    const triggered = cycles >= 3;
    return {
      code: 'RAPID_DEPOSIT_WITHDRAWAL_CYCLES',
      weight: triggered ? Math.min(45, 20 + cycles * 5) : 0,
      detail: `${cycles} deposit→withdrawal cycles under 10 minutes in 24h`,
      triggered,
    };
  }

  /**
   * S3: multi-account via shared technical fingerprint (same IP or exact
   * same user-agent as another account, recently created accounts only).
   */
  private async multiAccountSignal(userId: string): Promise<RiskSignal> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const sessions = await prisma.userSession.findMany({
      where: { userId, startedAt: { gte: since } },
      select: { ipAddress: true, userAgent: true },
      take: 20,
      orderBy: { startedAt: 'desc' },
    });
    const ips = [...new Set(sessions.map((s) => s.ipAddress).filter((v): v is string => !!v))];
    const agents = [...new Set(sessions.map((s) => s.userAgent).filter((v): v is string => !!v))];

    let sharedIpCount = 0;
    let sharedAgentCount = 0;
    try {
      if (ips.length) {
        const g = await prisma.userSession.groupBy({
          by: ['userId'],
          where: {
            ipAddress: { in: ips },
            userId: { not: userId },
            startedAt: { gte: since },
          },
        });
        sharedIpCount = g.length;
      }
      if (agents.length) {
        const g = await prisma.userSession.groupBy({
          by: ['userId'],
          where: {
            userAgent: { in: agents },
            userId: { not: userId },
            startedAt: { gte: since },
            AND: [{ userId: { not: userId } }],
          },
        });
        sharedAgentCount = g.length;
      }
    } catch {
      /* analytics only — never block the flow */
    }

    const triggered = sharedIpCount >= 3 || sharedAgentCount >= 5;
    return {
      code: 'MULTI_ACCOUNT_TECHNICAL_OVERLAP',
      weight: triggered ? Math.min(35, 15 + sharedIpCount * 3 + sharedAgentCount) : 0,
      detail: `IPs shared with ${sharedIpCount} other accounts, agents with ${sharedAgentCount}`,
      triggered,
    };
  }

  /** S4: bot-like timing — abnormally consistent bet inter-arrival times. */
  private async botTimingSignal(userId: string): Promise<RiskSignal> {
    const bets = await prisma.bet.findMany({
      where: { userId, placedAt: { not: null } },
      orderBy: { placedAt: 'desc' },
      take: 30,
      select: { placedAt: true },
    });
    if (bets.length < 12) {
      return { code: 'BOT_LIKE_TIMING', weight: 0, detail: 'insufficient samples', triggered: false };
    }
    const gaps: number[] = [];
    for (let i = 0; i < bets.length - 1; i++) {
      gaps.push(new Date(bets[i].placedAt!).getTime() - new Date(bets[i + 1].placedAt!).getTime());
    }
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0; // coefficient of variation
    // Humans jitter; automation is metronomic (cv very low) or hyper-fast (< 2 s).
    const triggered = (cv < 0.12 && mean < 60_000) || mean < 1_800;
    return {
      code: 'BOT_LIKE_TIMING',
      weight: triggered ? 35 : 0,
      detail: `timing CV=${cv.toFixed(3)}, mean gap=${Math.round(mean)}ms`,
      triggered,
    };
  }

  /** S5: repeated failed authentication attempts (credential attack/A TO indicator). */
  private async authAttackSignal(userId: string): Promise<RiskSignal> {
    const since = new Date(Date.now() - 60 * 60_000);
    const failed = await prisma.activityEvent.count({
      where: { userId, eventType: 'AUTH_FAILED_LOGIN', serverTs: { gte: since } },
    });
    const triggered = failed >= 10;
    return {
      code: 'REPEATED_FAILED_AUTH',
      weight: triggered ? Math.min(30, failed) : 0,
      detail: `${failed} failed logins in the last hour`,
      triggered,
    };
  }

  /** S6: abnormal withdrawal frequency. */
  private async withdrawalFrequencySignal(userId: string): Promise<RiskSignal> {
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const count = await prisma.withdrawal.count({ where: { userId, createdAt: { gte: since } } });
    const triggered = count > 8;
    return {
      code: 'ABNORMAL_WITHDRAWAL_FREQUENCY',
      weight: triggered ? Math.min(30, 10 + count * 2) : 0,
      detail: `${count} withdrawal requests in 24h`,
      triggered,
    };
  }

  // ---- composite ---------------------------------------------------------

  /**
   * Full assessment for one user. Composes 6 independent signals; the score
   * is the sum of triggered weights (capped 0-100) with reasons.
   */
  async assessUser(userId: string): Promise<RiskAssessment> {
    const signals = await Promise.all([
      this.velocitySignal(userId),
      this.cycleSignal(userId),
      this.multiAccountSignal(userId),
      this.botTimingSignal(userId),
      this.authAttackSignal(userId),
      this.withdrawalFrequencySignal(userId),
    ]);

    const score = Math.min(100, signals.reduce((a, s) => a + s.weight, 0));
    const level = levelFor(score);
    const reasons = signals.filter((s) => s.triggered).map((s) => `${s.code}: ${s.detail}`);

    return { userId, score, level, signals, reasons };
  }

  /**
   * Run assessment and persist an OPEN RiskEvent when MEDIUM+ with change
   * detection (don't re-open identical events while one is unresolved).
   */
  async assessAndRecord(userId: string, metadata?: Record<string, unknown>): Promise<RiskAssessment> {
    const assessment = await this.assessUser(userId);

    if (assessment.level === 'LOW') {
      return assessment;
    }

    // Skip if an unresolved event of same-or-higher level already exists.
    const order: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
    const open = await prisma.riskEvent.findFirst({
      where: { userId, status: 'OPEN', riskLevel: { in: ['MEDIUM', 'HIGH', 'CRITICAL'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (open && order[open.riskLevel as RiskLevel] >= order[assessment.level]) {
      return assessment;
    }

    const riskEvent = await prisma.riskEvent.create({
      data: {
        userId,
        category: assessment.signals.find((s) => s.triggered)?.code.split('_')[0] || 'VELOCITY',
        riskScore: assessment.score,
        riskLevel: assessment.level,
        reasons: JSON.stringify(assessment.reasons),
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    trackEvent({
      eventType: 'ANALYTICS_ERROR',
      userId,
      metadata: { analyticEvent: 'RISK_EVENT_CREATED', riskScore: assessment.score, level: assessment.level },
    });

    if (assessment.level === 'HIGH' || assessment.level === 'CRITICAL') {
      await alertsService.raise({
        dedupeKey: `risk:user:${userId}`,
        category: 'FRAUD',
        severity: assessment.level === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        title: `High-risk activity: user ${userId}`,
        message: assessment.reasons.join(' • ') || `Risk score ${assessment.score}`,
        linkType: 'USER',
        linkId: userId,
        metadata: { riskScore: assessment.score, level: assessment.level },
      });
    }

    return assessment;
  }

  /** Bot state model per user (NORMAL/SUSPICIOUS/HIGH_RISK/UNDER_REVIEW/BLOCKED). */
  deriveBotState(assessment: RiskAssessment, underReviewFlag: boolean): string {
    if (underReviewFlag) return 'UNDER_REVIEW';
    switch (assessment.level) {
      case 'CRITICAL': return 'HIGH_RISK';
      case 'HIGH': return 'SUSPICIOUS';
      default: return 'NORMAL';
    }
  }

  /**
   * Lightweight per-action hook called AFTER financial commits. Rate-limited
   * so we don't run the full 6-signal assessment on every bet: full
   * assessment runs at most once per user per 5 minutes; between runs we
   * only track a fast in-memory counter.
   */
  private lastAssessment = new Map<string, number>();
  private actionCounts = new Map<string, number>();

  async recordUserAction(userId: string, action: string): Promise<void> {
    try {
      const key = userId;
      this.actionCounts.set(key, (this.actionCounts.get(key) ?? 0) + 1);

      const last = this.lastAssessment.get(key) ?? 0;
      const now = Date.now();
      // Assess early if the user is very active, else at most every 5 min.
      const actions = this.actionCounts.get(key) ?? 0;
      if (now - last < 5 * 60_000 && actions < 50) return;

      this.lastAssessment.set(key, now);
      this.actionCounts.set(key, 0);
      await this.assessAndRecord(userId, { trigger: action });
    } catch {
      /* risk checks must never throw into the game path */
    }
  }
}

export const riskEngine = new RiskEngine();
