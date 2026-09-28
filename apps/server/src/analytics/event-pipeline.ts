import prisma from '../lib/prisma';

export type AnalyticsEventType =
  | 'USER_REGISTERED' | 'USER_LOGIN' | 'USER_LOGOUT' | 'SESSION_STARTED' | 'SESSION_ENDED'
  | 'DEPOSIT_CREATED' | 'DEPOSIT_APPROVED' | 'DEPOSIT_REJECTED'
  | 'BET_PLACED' | 'BET_CANCELLED' | 'BET_ACCEPTED' | 'BET_REJECTED'
  | 'ROUND_STARTED' | 'ROUND_JOINED' | 'ROUND_CRASHED' | 'ROUND_SETTLED'
  | 'CASHOUT_REQUESTED' | 'CASHOUT_ACCEPTED' | 'CASHOUT_REJECTED'
  | 'BET_WON' | 'BET_LOST'
  | 'PAYOUT_CREATED'
  | 'WITHDRAWAL_CREATED' | 'WITHDRAWAL_RESERVED' | 'WITHDRAWAL_APPROVED' | 'WITHDRAWAL_REJECTED' | 'WITHDRAWAL_RELEASED' | 'WITHDRAWAL_COMPLETED'
  | 'ACCOUNT_SUSPENDED' | 'ACCOUNT_REACTIVATED'
  | 'AUTH_FAILED_LOGIN' | 'ANALYTICS_ERROR';

export interface AnalyticsEvent {
  eventType: AnalyticsEventType;
  userId?: string | null;
  roundId?: string | null;
  betId?: string | null;
  transactionId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  amount?: number | string | null;
  currency?: string;
  metadata?: Record<string, unknown> | null;
}

interface QueuedEvent extends AnalyticsEvent {
  serverTs: Date;
}

/**
 * ASYNCHRONOUS, BUFFERED ANALYTICS EVENT PIPELINE.
 *
 * Design rules (see REALTIME_ANALYTICS_ARCHITECTURE.md §4):
 *  - `track()` NEVER blocks the caller: it enqueues and returns immediately.
 *    Financial transactions stay fast; analytics is strictly downstream.
 *  - Events are flushed to the DB in batches (default 25 / 2 s) — one INSERT
 *    per batch instead of one per event.
 *  - Back-pressure: beyond maxQueueSize the OLDEST events are dropped
 *    (analytics is best-effort; financial correctness never depends on it).
 *  - Failure isolation: DB flush errors are logged and retried once with the
 *    batch intact; the pipeline can never throw into a financial flow.
 */
class EventPipeline {
  private queue: QueuedEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;
  private readonly batchSize = 25;
  private readonly flushIntervalMs = 2000;
  private readonly maxQueueSize = 20000;

  track(event: AnalyticsEvent): void {
    // Never block or throw into the caller.
    try {
      if (this.queue.length >= this.maxQueueSize) {
        // Back-pressure: drop oldest (keep newest signals).
        this.queue.splice(0, Math.floor(this.maxQueueSize / 10));
      }
      this.queue.push({ ...event, serverTs: new Date() });
      if (this.queue.length >= this.batchSize) {
        void this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.flush();
        }, this.flushIntervalMs);
      }
    } catch {
      /* swallow — analytics must never break the request path */
    }
  }

  /** Flush queued events to the DB. Safe to call concurrently. */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue.splice(0, this.batchSize);
    try {
      await prisma.activityEvent.createMany({
        data: batch.map((e) => ({
          eventType: e.eventType,
          userId: e.userId ?? null,
          roundId: e.roundId ?? null,
          betId: e.betId ?? null,
          transactionId: e.transactionId ?? null,
          requestId: e.requestId ?? null,
          sessionId: e.sessionId ?? null,
          amount: e.amount != null ? String(e.amount) : null,
          currency: e.currency ?? 'ETB',
          metadata: e.metadata ? JSON.stringify(e.metadata) : null,
          serverTs: e.serverTs,
        })),
      });
    } catch (err: any) {
      console.error('[ANALYTICS] flush failed, requeueing:', err.message);
      // Requeue at front once; drop if the queue is saturated (back-pressure).
      if (this.queue.length < this.maxQueueSize) {
        this.queue.unshift(...batch);
      }
    } finally {
      this.flushing = false;
      // If more events accumulated while flushing, keep draining.
      if (this.queue.length >= this.batchSize) {
        setImmediate(() => void this.flush());
      }
    }
  }

  /** Graceful shutdown — flush everything, tolerating in-flight flushes. */
  async shutdown(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    let guard = 0;
    while (this.queue.length > 0 && guard++ < 100) {
      await this.flush();
      // If a concurrent flush held the gate, wait for it to release.
      if (this.queue.length > 0) {
        await new Promise((r) => setTimeout(r, 25));
      }
    }
  }

  /** Current queue depth (exposed in system health metrics). */
  getQueueDepth(): number {
    return this.queue.length;
  }
}

export const eventPipeline = new EventPipeline();

/** Convenience wrappers keep call sites terse and type-safe. */
export function trackEvent(event: AnalyticsEvent): void {
  eventPipeline.track(event);
}

/** Fire-and-forget wrapper that also swallows sync errors. */
export function trackEventSafe(event: AnalyticsEvent): void {
  try {
    eventPipeline.track(event);
  } catch {
    /* ignore */
  }
}
