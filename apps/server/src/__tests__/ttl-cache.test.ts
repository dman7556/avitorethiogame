/**
 * M3 REGRESSION TESTS — bounded TTL cache.
 *
 * Bug being guarded against: unbounded in-process Maps (chat rate-limit map,
 * suspension cache) grow with every distinct user forever — a memory leak on
 * a long-lived server. TtlCache bounds them: hard size cap with lazy
 * stalest-first eviction, per-entry TTL expiry, both independent.
 */
import { describe, it, expect } from 'vitest';
import { TtlCache } from '../lib/ttl-cache';

describe('TtlCache', () => {
  it('evicts oldest entries when the cap is exceeded and size never passes the cap', () => {
    const cap = 5;
    const cache = new TtlCache<number>(60_000, cap);

    for (let i = 0; i < cap + 10; i++) {
      cache.set(`k${i}`, i);
      expect(cache.size).toBeLessThanOrEqual(cap);
    }

    // 15 inserts into a 5-cap cache: the 10 oldest keys are gone.
    expect(cache.size).toBe(cap);
    for (let i = 0; i < 10; i++) {
      expect(cache.get(`k${i}`)).toBeUndefined();
    }
    for (let i = 10; i < 15; i++) {
      expect(cache.get(`k${i}`)).toBe(i);
    }
  });

  it('overwriting an existing key does not evict anything (cap excludes updates)', () => {
    const cache = new TtlCache<number>(60_000, 3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('a', 100); // update, not an insert
    expect(cache.size).toBe(3);
    expect(cache.get('a')).toBe(100);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('TTL expiry works independently of the cap', async () => {
    const cache = new TtlCache<string>(30, 1000); // huge cap, tiny TTL

    cache.set('x', 'v1');
    expect(cache.get('x')).toBe('v1');

    await new Promise((r) => setTimeout(r, 45));
    expect(cache.get('x')).toBeUndefined(); // expired lazily on read
    expect(cache.size).toBe(0); // and the entry is physically gone

    // Expired entries do not consume cap space.
    for (let i = 0; i < 1000; i++) cache.set(`k${i}`, `v${i}`);
    expect(cache.get('x')).toBeUndefined();
  });

  it('expired entries are swept first when the cap is hit', async () => {
    const cache = new TtlCache<number>(40, 3);

    cache.set('e1', 1);
    cache.set('e2', 2);
    await new Promise((r) => setTimeout(r, 60)); // e1, e2 now expired
    cache.set('e3', 3);
    cache.set('e4', 4);
    cache.set('e5', 5); // cap hit: expired e1/e2 swept before any live entry
    expect(cache.size).toBe(3);
    expect(cache.get('e3')).toBe(3);
    expect(cache.get('e4')).toBe(4);
    expect(cache.get('e5')).toBe(5);
  });

  it('delete removes an entry outright', () => {
    const cache = new TtlCache<number>(60_000, 10);
    cache.set('a', 1);
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});
