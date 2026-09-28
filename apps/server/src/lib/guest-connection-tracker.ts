/**
 * Per-IP cap on simultaneous guest (no-token) socket connections (audit M4).
 *
 * Counts live in the shared TtlCache (M3) with a sliding 10-minute TTL: an
 * IP idle for 10 minutes frees its slots even if a stale socket record was
 * never released. That makes counts approximate under churn — by design;
 * this is a blunt anti-abuse cap, not accounting. Releases clamp at zero so
 * double-disconnects cannot drive counts negative.
 */
import { TtlCache } from './ttl-cache';

const GUEST_IP_TTL_MS = 10 * 60_000; // 10 min since an IP's last activity
const GUEST_IP_MAX_ENTRIES = 50_000; // bounded IP map (M3 discipline)
const GUEST_IP_CACHE = new TtlCache<number>(GUEST_IP_TTL_MS, GUEST_IP_MAX_ENTRIES);

/** Hard cap on simultaneous guest connections per client IP. */
export const MAX_GUEST_CONNECTIONS_PER_IP = 5;

function clientIpOf(socket: { handshake: { address?: string; headers: Record<string, string | string[] | undefined> } }): string {
  // Behind the Vite dev proxy the real client is in x-forwarded-for. Take the
  // first hop (the connecting client), not the proxy chain.
  const fwd = socket.handshake.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  return (first?.split(',')[0]?.trim() || socket.handshake.address || 'unknown').trim();
}

export function guestIpOf(socket: Parameters<typeof clientIpOf>[0]): string {
  return clientIpOf(socket);
}

/** Current guest count for an IP (0 if the entry expired). */
export function guestCountForIp(ip: string): number {
  return GUEST_IP_CACHE.get(ip) ?? 0;
}

/**
 * Admit a guest connection if the IP is under its cap.
 * Returns false when the IP is at/over MAX_GUEST_CONNECTIONS_PER_IP.
 * Call once per accepted guest connection, then releaseGuest on disconnect.
 */
export function tryAdmitGuest(ip: string): boolean {
  const current = guestCountForIp(ip);
  if (current >= MAX_GUEST_CONNECTIONS_PER_IP) return false;
  GUEST_IP_CACHE.set(ip, current + 1);
  return true;
}

/** Release one guest slot for an IP (idempotent-safe; clamps at zero). */
export function releaseGuest(ip: string): void {
  const current = guestCountForIp(ip);
  if (current > 0) GUEST_IP_CACHE.set(ip, current - 1);
}

/** Test helper: drop all state. */
export function resetGuestTracking(): void {
  GUEST_IP_CACHE.clear();
}
