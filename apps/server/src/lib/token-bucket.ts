/**
 * Per-key token-bucket rate limiter (audit H3).
 *
 * Classic token bucket: a bucket starts with `capacity` tokens and refills
 * continuously at `refillPerSecond`. Each request consumes one token; an
 * empty bucket rejects. This allows short legitimate bursts (e.g. place +
 * cancel + re-place) while capping sustained flood rates.
 *
 * Scope note: state is in-process (per node). If the game ever scales
 * horizontally, swap the Map for Redis — the call sites stay identical.
 * Buckets for keys idle longer than IDLE_EVICT_MS are lazily dropped on
 * write so the map cannot grow without bound (audit M3 pattern).
 */
export class TokenBucketLimiter {
  private buckets = new Map<string, { tokens: number; last: number }>();
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly idleEvictMs: number;

  constructor(opts: { capacity: number; refillPerSecond?: number; idleEvictMs?: number }) {
    this.capacity = opts.capacity;
    // Default refill: full bucket over the same window the capacity is
    // described in (e.g. capacity 5 over 2 s => 2.5 tokens/s).
    this.refillPerSecond = opts.refillPerSecond ?? opts.capacity / 2;
    this.idleEvictMs = opts.idleEvictMs ?? 5 * 60_000;
  }

  /**
   * Consume one token for `key`. Returns true if allowed, false if the
   * bucket is empty (request must be rejected).
   */
  tryConsume(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket) {
      // Lazy eviction: when the map gets large, drop long-idle buckets.
      if (this.buckets.size > 10_000) {
        for (const [k, b] of this.buckets) {
          if (now - b.last > this.idleEvictMs) this.buckets.delete(k);
        }
      }
      this.buckets.set(key, { tokens: this.capacity - 1, last: now });
      return true;
    }

    const elapsed = (now - bucket.last) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerSecond);
    bucket.last = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Seconds until the bucket can serve one more request (for Retry-After). */
  retryAfterSeconds(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.tokens >= 1) return 0;
    return Math.max(0.1, Math.ceil(((1 - bucket.tokens) / this.refillPerSecond) * 10) / 10);
  }
}
