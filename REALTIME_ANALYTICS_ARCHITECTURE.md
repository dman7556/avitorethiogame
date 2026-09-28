# Real-Time Analytics Architecture — SkyRush

## 1. Prime Directive

> **OBSERVE ≠ MANIPULATE · ANALYZE ≠ TARGET · RISK MANAGEMENT ≠ RIGGING**

The analytics layer is a **strictly read-only observer** of the platform. It can
write to its own tables (`ActivityEvent`, `UserSession`, `RiskEvent`,
`AdminAlert`, `PlatformMetricSnapshot`) and raise alerts. It **cannot**:

- move wallet balances (verified by test `risk assessment never changes a wallet`)
- touch `GameRound` rows or crash points (verified by test `responsible-gaming checks never change a wallet or game round`)
- influence crash-point generation (structurally impossible — see §2)

Enforcement is structural, not procedural: risk/responsible-gaming modules have
no imports of `BetManager`/wallet mutation paths, and the outcome function's
signature accepts only `(serverSeed, roundNumber)` — no player state can even be
passed in. Tests in `apps/server/src/__tests__/analytics.test.ts` assert both.

## 2. Discovered Architecture (pre-change state)

```
Browser (React+Vite :5174)
  ├─ REST /api/*  → Express (:4000) → services → Prisma → SQLite (Supabase-shaped schema)
  └─ Socket.IO    → socket/handler.ts (auth → rooms user:{id}, admin)
                        ↓
                  GameEngine loop: DemoCrashPointProvider (crypto.randomBytes)
                        ↓
                  BetManager (place/cashout/settle; guarded atomic wallet updates)
                        ↓
                  Wallet + WalletTransaction (immutable ledger, Decimal math)
                        ↓
                  Deposit/Withdrawal services (PENDING → admin approve/reject, reservations)
```

Auth = Supabase tokens verified server-side (`supabase-auth.ts`), roles on the
User row (`USER | ADMIN`), admin routes behind `authenticate, requireAdmin`.
Existing analytics capability before this change: none beyond dashboard counts.

## 3. What Was Wrong (fairness leaks found & fixed)

1. **`curveData` leak (critical).** `round:tick` broadcast points whose y-axis
   was `((m−1)/(cp−1))·100`. Any observer could solve `cp = (m−1)·100/y + 1`
   mid-flight and cash out perfectly. **Fix:** `curveData` removed from the
   wire entirely (frontend never consumed it; clients draw from the
   multiplier series).
2. **Growth-rate leak (critical).** `MultiplierEngine` scaled the exponential
   growth rate by `log(crashPoint)` — the curve's *slope* revealed whether a
   round would be high or low. **Fix:** fixed `GROWTH_RATE = 0.05`;
   `multiplier(t) = e^(kt)` is now a pure function of elapsed time.
3. **No verifiability.** Outcomes were random but unprovable. **Fix:** provably
   fair commit/reveal (§4).

## 4. Provably Fair Outcome Generation

```
beginRound(roundNumber):
  serverSeed = crypto.randomBytes(32)            # secret until settlement
  serverSeedHash = SHA256(serverSeed)            # published BEFORE betting opens
  h = HMAC_SHA256(serverSeed, "sky-rush:" + roundNumber)
  u = first 52 bits of h / 2^52                  # uniform [0,1)
  crashPoint = clamp(round2((1 − 0.03)/(1 − u)), 1.01, 10000)
reveal (at settlement): serverSeed published on round:settled + stored on GameRound
verify:  recompute h → u → crashPoint; compare SHA256(serverSeed) to the commit
```

Inputs to the outcome: **only** `(serverSeed, roundNumber)`. Player identity,
balances, bet sizes, deposit totals, platform exposure and previous results are
not inputs — the code has no path through which they could be. The seed rotates
every 1000 rounds. If the round-number retry loop lands on a different number,
the outcome is **re-derived for the actual number before any bet exists**.

## 5. Event Pipeline (async, buffered, failure-isolated)

```
financial/game/auth flow ──commit──▶ trackEvent(...)   (never blocks, never throws)
                                        │  in-memory ring (20k cap; oldest dropped)
                                        ▼
                       batch flush (25 events / 2 s) → activity_event INSERT (createMany)
                                        │
                          flush error → requeue once → drop on saturation (back-pressure)
```

Rules: analytics never runs inside a financial transaction; a pipeline outage
can never fail a bet, deposit, or withdrawal. `eventQueueDepth` is exported to
system health and alerts above 5000.

## 6. Data Model (added to `prisma/schema.prisma`)

| Model | Purpose | Key indexes |
|---|---|---|
| `ActivityEvent` | append-only activity stream (login, bet, cashout, deposit, …) | `(userId,serverTs) (eventType,serverTs) serverTs sessionId roundId betId transactionId` |
| `UserSession` | one row per socket session; aggregates wagered/payout/rounds | `(userId,startedAt) endedAt` |
| `RiskEvent` | explainable risk flags with review workflow | `(userId,createdAt) (riskLevel,status) (category,status) status` |
| `AdminAlert` | deduplicated (unique `dedupeKey`), prioritized, auditable alerts | unique dedupeKey, `(category,isResolved) (severity,isResolved)` |
| `PlatformMetricSnapshot` | 60 s time-series of platform KPIs | `capturedAt` |

Plus fairness fields on `GameRound`: `serverSeedHash` (commit) and `serverSeed`
(reveal). Retention: ActivityEvents > 90 days and snapshots > 7 days are
pruned by `metricsEngine.runRetention()`; **financial ledger rows are never
touched** (asserted by test).

## 7. Realtime Fan-Out

`realtimeBridge` decouples analytics singletons from Socket.IO. Admin room
(`admin`) receives `admin:metrics` (5 s hot counters), `admin:alert` (new
alerts), `admin:online`. Player privacy: only anonymized usernames ever leave
the server to players (`getPublicBets`); analytics endpoints are admin-only
(`authenticate, requireAdmin`).

## 8. Scaling Path (measured-first)

Current: single Node process + SQLite. Measured headroom (dev machine):
76k outcome derivations/s, 1.5k events/s batched writes, p95 215 ms under
paced HTTP load with rate limiting active. Vertical headroom is large.

When a real bottleneck appears (measure first!):
1. Postgres + read replicas for analytics queries (schema is Supabase-ready).
2. Redis for hot counters + Socket.IO adapter (multi-instance broadcast).
3. Move pipeline flush behind a queue (BullMQ) — the `trackEvent` seam already
   makes this a drop-in swap inside `event-pipeline.ts` only.

## 9. Failure Handling

| Failure | Behavior |
|---|---|
| Pipeline flush error | requeue once, drop on saturation; request path unaffected |
| Analytics DB down | risk/monitoring calls catch-all → no-op with logs |
| Socket down | `realtimeBridge` swallows; REST still serves data |
| Server restart | dangling sessions closed by sweeper / next startSession |
| Game loop error | 5 s retry; outcome never depends on analytics availability |
