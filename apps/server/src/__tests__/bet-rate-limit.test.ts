/**
 * H3 REGRESSION TEST — per-user betting rate limits.
 *
 * Verifies the token-bucket semantics the socket/HTTP betting paths rely on:
 *   1. Requests WITHIN the limit succeed (first `capacity` calls).
 *   2. Requests BEYOND the limit are rejected (tryConsume → false) with a
 *      computed retry-after — the handlers turn this into a RATE_LIMITED
 *      error back to that specific client (never silently dropped).
 *   3. The bucket REFILLS after the window passes (a rejected caller can
 *      proceed again without a restart).
 *   4. Buckets are PER-USER: one user's flood never throttles another.
 *
 * Limits under test are the confirmed production configs from
 * lib/bet-rate-limits.ts (place 5/2s, cashout 10/2s, cancel 5/2s).
 *
 * Run with: npx vitest run src/__tests__/bet-rate-limit.test.ts
 */
import { describe, it, expect } from 'vitest';
import { TokenBucketLimiter } from '../lib/token-bucket';
import { betLimiters, BET_RATE_LIMITS, RATE_LIMIT_CODE } from '../lib/bet-rate-limits';

describe('H3 — betting rate limits', () => {
  it('allows requests within the limit and rejects beyond it (bet:place budget)', () => {
    // Fresh limiter with the confirmed place config: 5 per 2 s.
    const limiter = new TokenBucketLimiter(BET_RATE_LIMITS.place);
    const user = 'user-place-1';

    const results = Array.from({ length: 8 }, () => limiter.tryConsume(user));

    // First 5 succeed…
    expect(results.slice(0, 5)).toEqual([true, true, true, true, true]);
    // …6th onward are rejected — the exact flood scenario.
    expect(results.slice(5)).toEqual([false, false, false]);
  });

  it('gives the cashout budget its separate, larger capacity (10 per 2 s)', () => {
    const limiter = new TokenBucketLimiter(BET_RATE_LIMITS.cashout);
    const user = 'user-cashout-1';

    const results = Array.from({ length: 12 }, () => limiter.tryConsume(user));
    expect(results.slice(0, 10).every(Boolean)).toBe(true);
    expect(results.slice(10)).toEqual([false, false]);
  });

  it('reports a retry-after for a rejected request and REFILLS after the window', async () => {
    const limiter = new TokenBucketLimiter({ capacity: 2, refillPerSecond: 50 }); // fast refill for test speed
    const user = 'user-refill-1';

    expect(limiter.tryConsume(user)).toBe(true);
    expect(limiter.tryConsume(user)).toBe(true);
    expect(limiter.tryConsume(user)).toBe(false); // empty
    expect(limiter.retryAfterSeconds(user)).toBeGreaterThan(0);

    // Continuous refill: after enough time for 1+ token, the caller proceeds.
    await new Promise((r) => setTimeout(r, 60)); // 50 tok/s ⇒ ~3 tokens
    expect(limiter.tryConsume(user)).toBe(true);
  });

  it('is per-user: one user flooding never throttles another', () => {
    const limiter = new TokenBucketLimiter(BET_RATE_LIMITS.place);

    // Drain user A completely.
    for (let i = 0; i < 5; i++) expect(limiter.tryConsume('flooder')).toBe(true);
    expect(limiter.tryConsume('flooder')).toBe(false);

    // User B is untouched — limits are keyed by userId, not per connection/IP.
    expect(limiter.tryConsume('innocent-bystander')).toBe(true);
  });

  it('exposes the shared production limiters with the confirmed configs and code', () => {
    expect(BET_RATE_LIMITS.place.capacity).toBe(5);
    expect(BET_RATE_LIMITS.cashout.capacity).toBe(10);
    expect(BET_RATE_LIMITS.cancel.capacity).toBe(5);
    expect(RATE_LIMIT_CODE).toBe('RATE_LIMITED');
    // Shared instances exist and are usable (consume one token each).
    expect(betLimiters.place.tryConsume('shared-smoke-user')).toBe(true);
    expect(betLimiters.cashout.tryConsume('shared-smoke-user')).toBe(true);
    expect(betLimiters.cancel.tryConsume('shared-smoke-user')).toBe(true);
  });
});
