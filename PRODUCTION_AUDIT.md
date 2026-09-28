# Production Audit — SkyRush

Forensic audit performed before production cutover. Severity: **CRITICAL / HIGH / MEDIUM / LOW / INFO**.
Every finding lists problem, root cause, impact, fix, and the test proving the fix.

---

## 1. Architecture & Data Flows

```
Browser (React+Vite, :5174)
  ├─ REST /api/* ──▶ Express ──▶ zod validation ──▶ service layer ──▶ Prisma (SQLite→Postgres path)
  │                    │ authenticate (Supabase token verify) + requireAdmin for /api/admin/*
  └─ Socket.IO  ──▶ socket/handler (token auth, rooms user:{id} / admin)
                        │
             GameEngine (provably-fair commit/reveal outcomes)
                        │
             BetManager (guarded atomic wallet ops + ledger)
                        │
             Deposit/Withdrawal services (PENDING → admin approval, reservations)
```

Financial authority: **server + database only.** Every balance change flows
through `prisma.$transaction` with Decimal math and an immutable
`WalletTransaction` row (before/after, actor, reference). The frontend only
*displays* server state.

Verified financial flows (all traced end-to-end):
- **Deposit:** upload → PENDING (no credit) → admin approve (atomic credit + ledger + audit + notify) / reject (no balance change).
- **Withdrawal:** submit (validate min 100, keep-200 rule, available funds) → **reserve** (balance untouched, `reserved` += amount, PENDING ledger row) → approve (reservation cleared once, no second deduction) / reject (release exactly once).
- **Bet:** available-balance check inside the tx with a guarded update → debit + ledger + bet row atomically.
- **Cashout:** server-derived multiplier → credit + ledger + status transition atomically.

## 2. Findings and Fixes

### CRITICAL-1 — Unauthenticated money-destruction endpoints
- **Problem:** `POST /api/admin/public/reset-user-balance` and `POST /api/admin/public/reset-all-balances` required **no authentication** and zeroed any user's (or every user's) wallet balance. Anyone who could reach the API could destroy all user funds and enumerate registered emails.
- **Root cause:** "for testing" debug endpoints registered on the router *before* the `authenticate, requireAdmin` middleware line (duplicated in two blocks of `admin.routes.ts`).
- **Impact:** Total loss of wallet funds; user enumeration; no audit trail.
- **Fix:** Both endpoints and both duplicate blocks removed entirely (261 lines). Frontend used none of them (verified: 0 references).
- **Test:** `security.test.ts → "the public reset routes no longer exist in the router source"` + live HTTP probe expecting 401/404.

### CRITICAL-2 — Live-round outcome leak over REST
- **Problem:** `GET /api/rounds/:id` did `...round` — spreading the raw row including `crashPoint` of the in-flight round and the un-revealed `serverSeed`. Any player could fetch the outcome before betting even closed and bet/cash out with certainty.
- **Root cause:** Response built by row-spread; fairness fields added to the schema later without sanitizing legacy responses.
- **Impact:** Complete compromise of game fairness (guaranteed winning strategy, unbounded financial exposure).
- **Fix:** New `lib/round-sanitize.ts` (`safeRoundView`): `crashPoint`/`serverSeed` are `null` unless `phase === 'SETTLED'`; round detail now uses an explicit field list (no spreads, so future columns can't leak); commit hash stays public by design. Socket `round:state` paths verified to already send `crashPoint: null`.
- **Test:** `security.test.ts → "safeRoundView hides crashPoint/serverSeed for non-settled rounds"` + `"round detail endpoint no longer spreads the raw row"`.

### CRITICAL-3 — Cashout multiplier trust
- **Problem:** `bet:cashout` accepted the client-requested multiplier as the settlement value. The socket handler passed `gameEngine.getCurrentMultiplier()` today, but `processCashout` treated the caller-supplied number as authoritative — any code path (or future refactor) passing a client value could pay an arbitrary multiplier, including post-crash.
- **Root cause:** No re-derivation from server state inside the financial routine.
- **Impact:** Direct payout inflation; post-crash cashouts on tick-race.
- **Fix:** `processCashout` now (1) recomputes the multiplier from the round's `startedAt` via the server clock, (2) rejects requests exceeding it + 0.05 tolerance, (3) rejects if the server multiplier has reached the crash point (late-cashout race), (4) settles at `min(requested, server)` so the client never gains an edge.
- **Test:** `security.test.ts → "rejects a multiplier higher than the server-derived value"` + rejection-path code assertions.

### HIGH-1 — Upload abuse surface
- **Problem:** 50 MB upload limit (RAM-buffered, DoS-friendly), and the declared MIME type was the only check — a renamed `.exe`/HTML file would be stored and later served from `/uploads`.
- **Root cause:** Multer defaults plus declaration-only validation.
- **Fix:** 5 MB cap + `files: 1` + multer `fileFilter`, and **magic-byte content validation** (`FF D8 FF`, PNG signature, `RIFF/WEBP`) as the authoritative check; content-derived MIME passed to Cloudinary.
- **Test:** `security.test.ts → upload content validation` (JPEG/PNG/WEBP detected; exe/HTML/text rejected).

### HIGH-2 — Privilege escalation vector via `user_metadata`
- **Problem:** Auto-created users inherited `role` from Supabase `user_metadata`, which is client-influenceable at signup in several Supabase configurations → potential self-issued ADMIN role.
- **Fix:** Role hardcoded to `'USER'` at creation; elevation only via direct DB/admin action.
- **Test:** `security.test.ts → "role is never taken from user_metadata on auto-create"`.

### HIGH-3 — `?token=` accepted on all methods
- **Problem:** The `<img>` auth fallback accepted tokens via query string on every request method, so a shared/leaked screenshot URL could authorize mutations (logs, browser history, Referer leakage).
- **Fix:** `?token=` now accepted **only on GET**; all other methods require the `Authorization` header.
- **Test:** `security.test.ts → "?token= accepted only for GET requests"`.

### HIGH-4 — Weak registration validation
- **Problem:** 6-char passwords, minimal phone check (`≥9 digits`), no name charset validation, case-sensitive duplicate emails.
- **Fix:** 8+ chars with letter+digit (frontend already enforced 8 in RegisterPage UI rules — aligned); Ethiopian phone regex `(+251|251|0)?(9|7)\d{8}` normalized to `+251…` before uniqueness checks; Unicode-safe name charset (letters/marks/spaces/`'.-`), trimmed, ≤60 chars; email lowercased/trimmed (also in login) closing case-duplicate bypass.
- **Test:** source assertions in `security.test.ts` (schema content) — plus live registration path unchanged for valid input.

### HIGH-5 — Suspended accounts could keep playing via open sockets
- **Problem:** REST middleware blocks suspended users, but an already-authenticated Socket.IO session survived a suspension; bets/cashouts continued.
- **Fix:** `assertUserActive` in BetManager (30 s cached check) before `placeBet` and `processCashout` → `ACCOUNT_SUSPENDED`.
- **Test:** `security.test.ts → "active user passes the cached check; suspended flag flips the decision"` (suspended user's bet rejected).

### HIGH-6 — No financial reconciliation
- **Problem:** Nothing verified `balance == Σ(ledger)`; a bug or exploit could silently desync wallets from the ledger.
- **Fix:** New `reconciliation.service.ts`: per-wallet ledger-sum invariant, negative balance/reserved checks, reserved≤balance check, ledger chain-break detection; full sweep raises **CRITICAL FINANCIAL alerts** (never auto-repairs); admin endpoints `POST /api/admin/reconcile`, `GET /api/admin/reconcile/:walletId`.
- **Test:** `security.test.ts → reconciliation detects tampering` (drifted wallet flagged; clean wallet passes).

### MEDIUM-1 — Unbounded request bodies & missing error handler
- **Fix:** `express.json({ limit: '1mb' })`; structured `/api` 404; global error handler mapping `entity.too.large`→413, malformed JSON→400, multer size errors→413, everything else→500 **without stack traces**; `X-Content-Type-Options: nosniff` + `Referrer-Policy` headers.
- **Test:** `security.test.ts → "global error handler exists in index.ts"`.

### MEDIUM-2 — Cloudinary orphan risk on DB failure
- **Fix:** Deposit route deletes the uploaded asset if the DB insert fails after a successful upload (upload-then-DB failure no longer leaks assets).

### MEDIUM-3 — Single-process rate limiter
- **Info:** `express-rate-limit` memory store is correct for one instance. Multi-instance deployment **requires** a shared store (`rate-limit-redis`) — documented in PRODUCTION_READINESS.md, not changed now (no Redis in current infra).

## 3. Verified-Sound Areas (no change needed)

- **Reservation withdrawal model:** approve clears reservation exactly once (guarded `updateMany` on `PENDING`); reject releases exactly once; balance never double-deducts. Money-flows tests cover double-approve/double-reject/concurrency.
- **Ledger:** immutable inserts; before/after on every row; reservation rows marked COMPLETED only at approval (the single legal update).
- **Deposit approval:** guarded `PENDING→APPROVED` transition + ledger + audit; idempotent (second attempt throws `DEPOSIT_ALREADY_PROCESSED`, no second credit).
- **Betting concurrency:** available-balance check re-read inside the transaction with a guarded update; unique constraint `(userId, roundId, slot)` blocks duplicate bets; `P2002` surfaced as a clean error.
- **Provably-fair engine:** outcome = HMAC(seed, roundNumber) only; commit before betting; reveal at settlement; per-round verification (see GAME_FAIRNESS_MODEL.md).
- **Admin surface:** all other admin routes sit behind `authenticate + requireAdmin`; audit logs record actor/target/amount/reason/IP.
- **IDOR spot-checks:** wallet/deposit/withdrawal/bet routes scope queries to `req.user.userId`; admin detail routes are role-gated. The one public read route (`round detail`) is now sanitized (CRITICAL-2).
- **No SQL injection surface:** Prisma parameterizes all queries; no string-built SQL found.

## 4. Remaining Risks (honest)

| Item | Severity | Status |
|---|---|---|
| Rate limiter needs Redis store for multi-instance | MEDIUM | documented, requires infra |
| SQLite single-writer ceiling | HIGH (at scale) | Postgres/Supabase migration required before real-money scale |
| Withdrawal payout execution (Telebirr/CBE) is manual/external | MEDIUM | ops workflow needed |
| No KYC/AML, no 2FA for admins | HIGH (regulatory) | product decision required |
| Real-money load testing not possible against a dev SQLite DB | — | NOT VERIFIED at production scale |
| Dependency advisories in `bcrypt`/`argon2` build toolchain (`tar` via `@mapbox/node-pre-gyp`) | MEDIUM | native build-time chain, not runtime-reachable; upgrade path documented |
| Secrets in local `.env` | MEDIUM | move to secret manager in deployment |

## 5. Endpoint Inventory (summary)

| Area | Auth | Notes |
|---|---|---|
| `POST /api/auth/register·login·verify·reset` | public | zod-validated, rate-limited |
| `GET /api/wallet` `/transactions` | user | own data only |
| `GET /api/rounds` | public | sanitized (no live outcomes) |
| `POST /api/deposits` (multipart) | user | 5 MB image + content check |
| `GET /api/deposits/:id/screenshot/raw` | owner/admin | `?token=` GET-only |
| `POST /api/withdrawals` | user | server validates + reserves |
| `/api/admin/*` (all) | **admin** | audit-logged; public block removed |
| Socket `bet:place/cashout/cancel`, `chat:send` | socket-auth | server-authoritative amounts |
