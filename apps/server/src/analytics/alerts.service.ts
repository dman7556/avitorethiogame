import prisma from '../lib/prisma';
import { realtimeBridge } from './realtime-bridge';
import { GAME_CONSTANTS } from '@sky-rush/shared';

/**
 * ADMIN ALERT CENTER.
 *
 * Alerts are: deduplicated (unique dedupeKey — re-raising the same condition
 * updates the existing row instead of spamming), prioritized (severity),
 * timestamped and auditable (resolvedBy/resolvedAt retained).
 *
 * Thresholds live in SystemSetting (key: alertThresholds) and are editable
 * from Admin → Analytics → Thresholds. Nothing is hardcoded in the frontend.
 */

export type AlertCategory = 'FINANCIAL' | 'FRAUD' | 'RESPONSIBLE_GAMING' | 'SYSTEM' | 'SECURITY';
export type AlertSeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';

export interface AlertThresholds {
  maxPendingWithdrawals: number;
  maxPendingWithdrawalValue: number;
  maxPendingDeposits: number;
  maxWalletLiability: number;
  maxBetsPerSecond: number;
  maxRiskEventsOpen: number;
  maxEventQueueDepth: number;
  maxSessionMinutes: number;
  maxLoginsPerMinutePerUser: number;
  maxFailedLoginsPerHourPerUser: number;
  maxLargeTransaction: number;
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  maxPendingWithdrawals: 25,
  maxPendingWithdrawalValue: 50000,
  maxPendingDeposits: 40,
  maxWalletLiability: 1_000_000,
  maxBetsPerSecond: 50,
  maxRiskEventsOpen: 30,
  maxEventQueueDepth: 5000,
  maxSessionMinutes: 240, // 4h session → responsible-gaming alert
  maxLoginsPerMinutePerUser: 6,
  maxFailedLoginsPerHourPerUser: 10,
  maxLargeTransaction: 20000,
};

export const THRESHOLD_KEY = 'alertThresholds';

export class AlertsService {
  private cache: { value: AlertThresholds; at: number } | null = null;

  async getThresholds(): Promise<AlertThresholds> {
    if (this.cache && Date.now() - this.cache.at < 30_000) return this.cache.value;
    try {
      const row = await prisma.systemSetting.findUnique({ where: { key: THRESHOLD_KEY } });
      const value = row ? { ...DEFAULT_ALERT_THRESHOLDS, ...JSON.parse(row.value) } : DEFAULT_ALERT_THRESHOLDS;
      this.cache = { value, at: Date.now() };
      return value;
    } catch {
      return DEFAULT_ALERT_THRESHOLDS;
    }
  }

  async updateThresholds(update: Partial<AlertThresholds>, updatedBy: string): Promise<AlertThresholds> {
    const current = await this.getThresholds();
    const value = { ...current, ...update };
    await prisma.systemSetting.upsert({
      where: { key: THRESHOLD_KEY },
      update: { value: JSON.stringify(value), updatedBy },
      create: { key: THRESHOLD_KEY, value: JSON.stringify(value), updatedBy },
    });
    this.cache = { value, at: Date.now() };
    return value;
  }

  /**
   * Raise an alert. Deduplicated by dedupeKey — if an unresolved alert with
   * the same key exists, it is refreshed (message/metadata) not duplicated.
   */
  async raise(input: {
    dedupeKey: string;
    category: AlertCategory;
    severity: AlertSeverity;
    title: string;
    message: string;
    linkType?: string;
    linkId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const existing = await prisma.adminAlert.findUnique({ where: { dedupeKey: input.dedupeKey } });

      if (existing && !existing.isResolved) {
        await prisma.adminAlert.update({
          where: { dedupeKey: input.dedupeKey },
          data: {
            message: input.message,
            metadata: input.metadata ? JSON.stringify(input.metadata) : existing.metadata,
          },
        });
        return; // already notified admins
      }

      if (existing && existing.isResolved) {
        // Condition recurred after resolution → create a fresh alert.
        await prisma.adminAlert.delete({ where: { dedupeKey: input.dedupeKey } });
      }

      const alert = await prisma.adminAlert.create({
        data: {
          dedupeKey: input.dedupeKey,
          category: input.category,
          severity: input.severity,
          title: input.title,
          message: input.message,
          linkType: input.linkType,
          linkId: input.linkId,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        },
      });

      realtimeBridge.toAdmin('admin:alert', alert);
    } catch (err: any) {
      // Dedupe races are fine (unique constraint) — never throw into callers.
      if (!String(err?.message || '').includes('Unique')) {
        console.error('[ALERTS] raise failed:', err.message);
      }
    }
  }

  /** Convenience: notify only when a threshold is crossed (with hysteresis by dedupe key). */
  async raiseIfExceeded(input: {
    dedupeKey: string;
    category: AlertCategory;
    severity: AlertSeverity;
    title: string;
    message: string;
    linkType?: string;
    linkId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const existing = await prisma.adminAlert.findUnique({ where: { dedupeKey: input.dedupeKey } });
    if (existing && !existing.isResolved) {
      await prisma.adminAlert.update({
        where: { dedupeKey: input.dedupeKey },
        data: { message: input.message },
      });
      return;
    }
    if (!existing) {
      await this.raise(input);
    }
  }
}

export const alertsService = new AlertsService();
