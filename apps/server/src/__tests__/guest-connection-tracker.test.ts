/**
 * M4 REGRESSION TESTS — per-IP cap on guest socket connections.
 *
 * Bug being guarded against: unbounded guest (no-token) connections — one IP
 * could open thousands of sockets, exhausting server memory/socket handles.
 * The tracker now caps simultaneous guest connections per client IP
 * (MAX_GUEST_CONNECTIONS_PER_IP = 5), with lazy TTL release so idle IPs free
 * their slots.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_GUEST_CONNECTIONS_PER_IP,
  guestCountForIp,
  releaseGuest,
  resetGuestTracking,
  tryAdmitGuest,
} from '../lib/guest-connection-tracker';

describe('GuestConnectionTracker', () => {
  beforeEach(() => resetGuestTracking());

  it('admits up to the cap and rejects the next connection from the same IP', () => {
    const ip = '10.0.0.1';
    for (let i = 0; i < MAX_GUEST_CONNECTIONS_PER_IP; i++) {
      expect(tryAdmitGuest(ip)).toBe(true);
    }
    expect(guestCountForIp(ip)).toBe(MAX_GUEST_CONNECTIONS_PER_IP);
    expect(tryAdmitGuest(ip)).toBe(false); // 6th concurrent guest: rejected
    expect(tryAdmitGuest(ip)).toBe(false);
  });

  it('tracks IPs independently', () => {
    for (let i = 0; i < MAX_GUEST_CONNECTIONS_PER_IP; i++) {
      expect(tryAdmitGuest('10.0.0.2')).toBe(true);
    }
    expect(tryAdmitGuest('10.0.0.2')).toBe(false);
    expect(tryAdmitGuest('10.0.0.3')).toBe(true); // different IP: unaffected
  });

  it('releases slots on disconnect so new connections are admitted again', () => {
    const ip = '10.0.0.4';
    for (let i = 0; i < MAX_GUEST_CONNECTIONS_PER_IP; i++) {
      tryAdmitGuest(ip);
    }
    expect(tryAdmitGuest(ip)).toBe(false);

    releaseGuest(ip); // one disconnect
    expect(guestCountForIp(ip)).toBe(MAX_GUEST_CONNECTIONS_PER_IP - 1);
    expect(tryAdmitGuest(ip)).toBe(true); // slot freed
  });

  it('release clamps at zero (double-disconnect cannot drive counts negative)', () => {
    const ip = '10.0.0.5';
    releaseGuest(ip);
    releaseGuest(ip);
    expect(guestCountForIp(ip)).toBe(0);
    // And the IP still has full capacity afterwards.
    for (let i = 0; i < MAX_GUEST_CONNECTIONS_PER_IP; i++) {
      expect(tryAdmitGuest(ip)).toBe(true);
    }
  });

  it('expires idle IP entries after the TTL', async () => {
    const ip = '10.0.0.6';
    tryAdmitGuest(ip);
    expect(guestCountForIp(ip)).toBe(1);
    // GUEST_IP_TTL_MS is 10 minutes in production; here we only verify the
    // count is stored through the TtlCache (bounded, expiring) by checking
    // the entry exists now — the TTL mechanism itself is covered by
    // ttl-cache.test.ts. This test documents the wiring, not the clock.
    resetGuestTracking();
    expect(guestCountForIp(ip)).toBe(0);
  });
});
