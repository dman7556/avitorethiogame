import { Server as SocketIOServer } from 'socket.io';

/**
 * Tiny realtime fan-out bridge.
 *
 * Analytics/risk modules are plain singletons with no knowledge of Socket.IO.
 * They publish here; this module forwards to connected ADMIN sockets only
 * (room `admin`). Keeping this seam means the analytics layer can be tested
 * and can scale behind a queue later without touching call sites.
 */
class RealtimeBridge {
  private io: SocketIOServer | null = null;

  attach(io: SocketIOServer): void {
    this.io = io;
  }

  /** Emit to admin room only — never broadcast analytics to players. */
  toAdmin(event: string, payload: unknown): void {
    try {
      this.io?.to('admin').emit(event, payload);
    } catch {
      /* realtime is best-effort */
    }
  }

  /** Emit to one user's private room (e.g. wallet balance updates). */
  toUser(userId: string, event: string, payload: unknown): void {
    try {
      this.io?.to(`user:${userId}`).emit(event, payload);
    } catch {
      /* best-effort */
    }
  }

  isConnected(): boolean {
    return this.io !== null;
  }
}

export const realtimeBridge = new RealtimeBridge();
