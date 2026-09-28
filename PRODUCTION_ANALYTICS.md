# Production Analytics — SkyRush

## Metrics Catalog

**Live (5 s hot broadcast → admins):** `betsPerSecond`, `cashoutsPerSecond`,
`transactionsPerSecond` (10 s rolling windows), `onlineUsers`, `activeSockets`,
`eventQueueDepth`, latency percentiles (p50/p95/p99 of financial routes).

**Cold (60 s aggregation + snapshot):** totalUsers, activeUsers24h,
pendingDeposits/Withdrawals, walletLiability, reservedFunds, bets/wagered/
payouts/deposits/withdrawals 24h, avgBet24h, GGR24h, openRiskEvents,
unresolvedAlerts. Persisted to `PlatformMetricSnapshot` (7-day retention) for
time-series views (`GET /api/admin/analytics/snapshots`).

**Current round (admin-only):** players, bets, min/max/avg bet, total wagered,
payout, winners/losers, auto vs manual cashouts, seed commit. Individual
players' private data is never exposed to other players.

## Dashboards (Admin → Live Analytics & Risk)

| Tab | Contents |
|---|---|
| Overview | live KPI grid (users, rates, latency, queue), 24h financials, current round |
| Alerts | severity-styled alert cards, filters (open/resolved/all), resolve action, drill-down |
| Risk Events | flagged users with explainable reasons, review workflow (under review/clear) |
| Fairness | current seed commit + per-round verification table (commit → reveal → verified) |
| Sessions | live sessions with wagered/payout aggregates, IP, timeline links |
| User Timeline | any user's full activity stream with linked transactions/bets/rounds + financial profile |

All sections update without refresh via the admin socket room.

## Observability

- Every HTTP request: `X-Request-Id` header + one structured JSON log line
  (`t, kind, requestId, method, path, status, ms`). No bodies/tokens logged.
- Financial routes record latency into the percentile window.
- Trace chain: `requestId → betId/transactionId → ledger entry → roundId`
  via ActivityEvent link fields and the timeline hydration.
- Analytics pipeline health: queue depth metric + SYSTEM alert > 5000.

## Configurable Thresholds

Stored in `SystemSetting["alertThresholds"]`, editable via
`GET/PUT /api/admin/alert-thresholds` (admin-authenticated), 30 s cached:
pending-withdrawal count/value, pending deposits, wallet liability, bets/sec,
open risk events, event queue depth, session minutes, logins/min,
failed logins/hour, large transaction.

## Measured Performance (dev machine, SQLite, single process)

```
Outcome derivation (HMAC fairness path):   72,946 /sec
Concurrent GET /api/health (paced, 180):   p50=36ms  p95=215ms  p99=217ms  0 errors
Rate limiting: 429s observed when unpaced (protection active)
Event pipeline (batched createMany):       1,565 events/sec
```

These are single-machine numbers demonstrating headroom — **not** a claim of
massive concurrent-user capacity. See PRODUCTION_READINESS.md §Scale for the
path beyond.
