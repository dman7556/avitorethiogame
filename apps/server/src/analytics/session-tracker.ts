import prisma from '../lib/prisma';
import { trackEvent } from './event-pipeline';
import { realtimeBridge } from './realtime-bridge';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * REAL-TIME SESSION TRACKING.
 *
 * One UserSession row per authenticated socket "session". Tracks lifecycle
 * (start / activity / end), aggregates per-session wagered/payout, and
 * maintains the platform-wide online-user count. Session rows power:
 *  - online users metric (sessions with endedAt = null)
 *  - responsible-gaming checks (session length, night sessions)
 *  - bot detection signals (inter-request timing comes from events)
 *
 * Sessions are keyed by socket id: one user with two tabs = two sessions.
 * The online-user count is DISTINCT users.
 */
class SessionTracker {
  /** socketId -> { userId, sessionId } for O(1) lookup on disconnect */
  private active = new Map<string, { userId: string; sessionId: string }>();
  private lastOnlineBroadcast = 0;

  async startSession(userId: string, socketId: string, ip?: string | null, userAgent?: string | null): Promise<string> {
    try {
      // Close any dangling session from a previous socket of this user
      // that never got its disconnect event (e.g. server restart).
      await prisma.userSession.updateMany({
        where: { userId, endedAt: null, socketId: { not: socketId } },
        data: { endedAt: new Date(), endReason: 'TIMEOUT' },
      });

      const session = await prisma.userSession.create({
        data: {
          userId,
          socketId,
          ipAddress: ip || null,
          userAgent: userAgent ? String(userAgent).slice(0, 500) : null,
        },
      });

      this.active.set(socketId, { userId, sessionId: session.id });
      trackEvent({ eventType: 'SESSION_STARTED', userId, sessionId: session.id });

      await this.broadcastOnlineCount();
      return session.id;
    } catch (err: any) {
      console.error('[SESSIONS] startSession failed:', err.message);
      return '';
    }
  }

  /** Refresh last activity; called opportunistically on user actions. */
  async touch(socketId: string): Promise<void> {
    const entry = this.active.get(socketId);
    if (!entry) return;
    try {
      await prisma.userSession.update({
        where: { id: entry.sessionId },
        data: { lastActivityAt: new Date() },
      });
    } catch {
      /* non-critical */
    }
  }

  /** Increment per-session game aggregates (called async by BetManager). */
  async recordBet(sessionId: string, amount: Decimal): Promise<void> {
    if (!sessionId) return;
    try {
      await prisma.userSession.update({
        where: { id: sessionId },
        data: {
          betsPlaced: { increment: 1 },
          totalWagered: { increment: amount },
        },
      });
    } catch {
      /* non-critical */
    }
  }

  async recordRoundPlayed(sessionId: string): Promise<void> {
    if (!sessionId) return;
    try {
      await prisma.userSession.update({
        where: { id: sessionId },
        data: { roundsPlayed: { increment: 1 } },
      });
    } catch {
      /* non-critical */
    }
  }

  async endSession(socketId: string, reason: 'LOGOUT' | 'DISCONNECT' | 'TIMEOUT' = 'DISCONNECT'): Promise<void> {
    const entry = this.active.get(socketId);
    if (!entry) return;
    this.active.delete(socketId);

    try {
      const session = await prisma.userSession.findUnique({
        where: { id: entry.sessionId },
        select: { startedAt: true, roundsPlayed: true },
      });
      await prisma.userSession.update({
        where: { id: entry.sessionId },
        data: { endedAt: new Date(), endReason: reason },
      });

      const durationSec = session
        ? Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000)
        : 0;

      trackEvent({
        eventType: 'SESSION_ENDED',
        userId: entry.userId,
        sessionId: entry.sessionId,
        metadata: { durationSec, rounds: session?.roundsPlayed ?? 0, reason },
      });

      await this.broadcastOnlineCount();
    } catch (err: any) {
      console.error('[SESSIONS] endSession failed:', err.message);
    }
  }

  getSessionId(socketId: string): string | undefined {
    return this.active.get(socketId)?.sessionId;
  }

  getUserId(socketId: string): string | undefined {
    return this.active.get(socketId)?.userId;
  }

  /** Live in-memory counts — no DB scan on the hot path. */
  getOnlineCount(): number {
    return new Set(Array.from(this.active.values()).map((v) => v.userId)).size;
  }

  getActiveSocketCount(): number {
    return this.active.size;
  }

  getActiveSessionIds(): string[] {
    return Array.from(this.active.values()).map((v) => v.sessionId);
  }

  /** Push the live online count to admins at most every 5 s. */
  async broadcastOnlineCount(): Promise<void> {
    const now = Date.now();
    if (now - this.lastOnlineBroadcast < 5000) return;
    this.lastOnlineBroadcast = now;
    realtimeBridge.toAdmin('admin:online', {
      onlineUsers: this.getOnlineCount(),
      activeSockets: this.getActiveSocketCount(),
    });
  }

  /**
   * Sweep sessions whose socket vanished without a disconnect event
   * (server crash, network drop). Called by the metrics interval.
   */
  async sweepStale(maxIdleMinutes = 60): Promise<number> {
    const cutoff = new Date(Date.now() - maxIdleMinutes * 60_000);
    try {
      const res = await prisma.userSession.updateMany({
        where: {
          endedAt: null,
          id: { notIn: this.getActiveSessionIds().length ? this.getActiveSessionIds() : ['-'] },
          lastActivityAt: { lt: cutoff },
        },
        data: { endedAt: new Date(), endReason: 'TIMEOUT' },
      });
      return res.count;
    } catch {
      return 0;
    }
  }
}

export const sessionTracker = new SessionTracker();
