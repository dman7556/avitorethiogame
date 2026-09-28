/**
 * H3 — confirmed betting rate limits, shared by the socket handlers
 * (authoritative path) and the HTTP bet routes (defense in depth).
 *
 * Limits confirmed by product owner (2026-09-15):
 *   bet:place   — 5 per 2 s per user
 *   bet:cashout — 10 per 2 s per user
 *   bet:cancel  — 5 per 2 s per user
 * Cancels are budgeted separately from places on purpose: the game allows
 * rapid place/cancel/re-place cycles by design.
 */
import { TokenBucketLimiter } from './token-bucket';

export const BET_RATE_LIMITS = {
  place: { capacity: 5, refillPerSecond: 2.5 }, // 5 per 2 s
  cashout: { capacity: 10, refillPerSecond: 5 }, // 10 per 2 s
  cancel: { capacity: 5, refillPerSecond: 2.5 }, // 5 per 2 s
} as const;

export const RATE_LIMIT_CODE = 'RATE_LIMITED';

/** One limiter per action; keys are `userId` strings. */
export const betLimiters = {
  place: new TokenBucketLimiter(BET_RATE_LIMITS.place),
  cashout: new TokenBucketLimiter(BET_RATE_LIMITS.cashout),
  cancel: new TokenBucketLimiter(BET_RATE_LIMITS.cancel),
};

export type BetAction = keyof typeof betLimiters;
