# Production Readiness — SkyRush

> Updated after the forensic production audit (see PRODUCTION_AUDIT.md for
> findings, fixes and proving tests). Audit fixes applied: removed
> unauthenticated money endpoints, closed live-round outcome leakage,
> server-validated cashout multipliers, hardened uploads/auth/registration,
> added reconciliation + structured error handling. Full suite: 62 tests green.

## Financial Invariants (enforced & tested)

1. Users cannot create money — credits only via admin-approved deposits/admin credit (guarded).
2. Users cannot modify balances — wallet writes exist only in server services.
3. Deposits cannot credit twice — guarded `PENDING→APPROVED updateMany` in the tx.
4. Withdrawals cannot deduct twice — reservation model; approval clears reserved once.
5. Reserved funds cannot be spent — betting checks `balance − reserved` with guarded update.
6. Rejected withdrawals release exactly once — guarded `PENDING→REJECTED updateMany`.
7. Approved withdrawals do not deduct again — balance never moves on approval; only reserved.
8. Payouts cannot be duplicated — cashout guarded by bet status transition.
9. Cashouts cannot happen twice — same guard.
10. Concurrent operations cannot create invalid balances — Decimal math + guarded updates inside transactions.
11. Every financial change has an immutable ledger record — `WalletTransaction` inserts only.
12. Every admin financial action is auditable — `AdminAuditLog` + processedBy + IP.
13. Analytics cannot modify financial state — proven by tests.
14. Analytics cannot modify game outcomes — structural isolation + tests.
15. Game outcomes cannot depend on player profitability — outcome function has no such inputs (GAME_FAIRNESS_MODEL.md).

## Security Posture

- Server-authoritative everything: multiplier, cashout timing, balances, roles.
- Admin routes behind `authenticate + requireAdmin`; analytics endpoints included.
- Rate limiting active on `/api/*` (100 req/min default; registration exempted).
- Helmet, strict CORS, Cloudinary signed server-side uploads; secrets server-only.
- No passwords/tokens/codes in logs or events; failed-login events store IP only.
- `?token=` accepted only as an `<img>` fallback on the screenshot endpoint (admin-or-owner).

## Gaps Before Real-Money Production (honest list)

- **Database**: dev SQLite → must move to Postgres/Supabase with migrations + backups.
- **Money movement**: withdrawals are approved in-app; actual payout execution
  (Telebirr/CBE transfer) is a manual/external process and needs an ops workflow.
- **KYC/AML**: not implemented. Required in most real-money jurisdictions.
- **Self-exclusion / deposit limits**: monitoring exists; player-facing controls
  do not yet (see RESPONSIBLE_GAMING_MODEL.md).
- **2FA**: not present for admins (recommended before launch).
- **Secrets**: `.env` in repo working tree — move to a secret manager.

## Scale Path (measure → move the bottleneck)

| Bottleneck signal | Action |
|---|---|
| Analytics query load on primary | Postgres + read replica for `/analytics/*` |
| Multi-instance realtime | Redis Socket.IO adapter (bridge already isolates emits) |
| Pipeline write ceiling | Queue (BullMQ) behind the `trackEvent` seam — one-file swap |
| Hot counters contention | Redis counters (bridge API unchanged) |
| Table growth | Existing retention job; then monthly partitions on `ActivityEvent` |

The architecture was built so each step is additive; no call sites change.

## Production Readiness Checklist (post-audit status)

- [x] Authentication secure (Supabase verify; hardened register/login validation)
- [x] Authorization secure (server-side roles; metadata escalation closed)
- [x] Admin protected (authenticate + requireAdmin; debug endpoints deleted)
- [x] Wallet protected (server-authoritative; suspended-user guards)
- [x] Ledger immutable (insert-only; chain verified by reconciliation)
- [x] Deposit flow atomic (guarded transitions; idempotent approval)
- [x] Withdrawal reservation correct (reserve → complete/release exactly once)
- [x] Withdrawal approval does not double-deduct (guarded updateMany)
- [x] Withdrawal rejection releases exactly once (guarded updateMany)
- [x] Betting financial integrity (available-balance guard inside tx)
- [x] Cashout integrity (server-recomputed multiplier; late-cashout rejection)
- [x] Database transactions (all financial mutations atomic)
- [x] Database indexes (purposeful, per audit; no over-indexing)
- [x] Input validation (zod on routes; magic-byte upload checks)
- [x] Rate limiting (single-instance; Redis store required for multi-instance)
- [x] Security headers (helmet + nosniff + referrer-policy)
- [x] CORS (explicit origin allowlist)
- [x] Secrets protected (server-only env; none in frontend bundle)
- [x] Cloudinary secure (signed server-side uploads; orphan cleanup)
- [x] Supabase secure (service key server-only; no client DB access)
- [x] RLS verified — **NOT APPLICABLE**: all DB access is service-side via Prisma; no client-direct Supabase data plane
- [x] Socket.IO secured (token auth, room scoping, server-authoritative payloads)
- [x] Error handling (global handler; no stack traces to clients)
- [x] Logging (request IDs, structured lines, no secrets)
- [x] Monitoring readiness (metrics engine, alerts, reconciliation)
- [x] Graceful shutdown (SIGTERM: engine stop, pipeline flush, server close)
- [ ] Backup/recovery strategy — requires infrastructure (not code)
- [ ] Load testing at production scale — NOT VERIFIED (dev SQLite only)
- [x] Dependency audit (npm audit run; advisories triaged, see PRODUCTION_AUDIT.md)
- [x] Build succeeds (shared + server + web)
- [x] Tests pass (62/62)
- [x] No demo accounts / fake balances / mock financial data
- [x] No development bypasses (public reset endpoints removed)

**Assessment: code-level production hardening COMPLETE. Remaining items are
infrastructure/operational (Postgres migration, Redis rate-limit store,
backup strategy, KYC/AML, admin 2FA, real-scale load testing) — see the
gaps list below and PRODUCTION_AUDIT.md §4.**

## Unverified Items

- Multi-instance Socket.IO fan-out (single process measured only).
- Postgres-specific query plans (all queries tested on SQLite).
- Real-payout reconciliation with payment providers.
- Behavior under sustained (hours-long) load and memory-growth characteristics.
- 100k-user concurrency claims are explicitly NOT made.
