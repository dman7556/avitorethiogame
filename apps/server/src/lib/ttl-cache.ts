/**
 * Bounded TTL map (audit M3): a Map with per-entry TTL and a hard size cap,
 * using the same lazy-eviction approach as the H3 token-bucket limiter
 * (lib/token-bucket.ts) — no timers, no background sweeps.
 *
 * Eviction is lazy (on read and on write): expired entries are dropped when
 * touched, and on insert past the cap the stalest entries are swept first.
 * Every operation is O(1) amortized; memory is bounded by `maxSize`.
 */
export class TtlCache<V> {
  private map = new Map<string, { value: V; at: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxSize: number
  ) {}

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.at >= this.ttlMs) {
      this.map.delete(key); // lazy expiry
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    const now = Date.now();
    // On cap breach (and this key not merely being overwritten), sweep
    // expired entries first — they are the stalest by definition — then,
    // if still full, drop the oldest-inserted entries.
    if (this.map.size >= this.maxSize && !this.map.has(key)) {
      for (const [k, entry] of this.map) {
        if (this.map.size < this.maxSize) break;
        if (now - entry.at >= this.ttlMs) this.map.delete(k);
      }
      while (this.map.size >= this.maxSize) {
        const oldest = this.map.keys().next().value;
        if (oldest === undefined) break;
        this.map.delete(oldest);
      }
    }
    this.map.set(key, { value, at: now });
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  /** Remove all entries (tests / administrative resets). */
  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
