# Player Activity Model — SkyRush

## Event Catalog

Every event row in `ActivityEvent` carries: `id, eventType, userId, roundId,
betId, transactionId, requestId, sessionId, amount, currency, metadata,
serverTs`. Sensitive values (passwords, tokens, codes) are never recorded.

| Event | Emitted at | Key fields |
|---|---|---|
| `USER_REGISTERED` | POST /api/auth/register success | userId |
| `USER_LOGIN` | REST login + socket `auth:authenticate` | userId, sessionId |
| `USER_LOGOUT` | socket disconnect | userId, reason |
| `SESSION_STARTED` / `SESSION_ENDED` | socket lifecycle | sessionId, durationSec |
| `DEPOSIT_CREATED` / `DEPOSIT_APPROVED` / `DEPOSIT_REJECTED` | deposit service, post-commit | transactionId, amount, adminId |
| `BET_PLACED` / `BET_CANCELLED` | BetManager, post-commit | betId, roundId, amount, slot |
| `CASHOUT_ACCEPTED` / `PAYOUT_CREATED` | manual + auto cashouts | betId, multiplier, amount |
| `BET_LOST` | settleRoundBets | betId, amount |
| `ROUND_STARTED` / `ROUND_JOINED` / `ROUND_CRASHED` / `ROUND_SETTLED` | GameEngine | roundId, roundNumber, serverSeedHash |
| `WITHDRAWAL_CREATED` / `WITHDRAWAL_RESERVED` / `WITHDRAWAL_APPROVED` / `WITHDRAWAL_REJECTED` / `WITHDRAWAL_RELEASED` | withdrawal service, post-commit | transactionId, amount |
| `AUTH_FAILED_LOGIN` | failed login route | ip only (never the password) |

## Per-User Financial Profile (`/api/admin/users/:id/profile`)

Derived live from the authoritative tables — never stored twice:

- balance / reserved / available (from Wallet)
- total & approved deposits/withdrawals (Deposit/Withdrawal aggregates)
- totalBets, totalWagered, totalPayout, netGaming, avgBet, largestBet (Bet aggregates)
- cashouts, avgCashoutMultiplier, roundsPlayed, sessions

## Session Analytics (`UserSession`)

One row per authenticated socket: started/ended, duration, roundsPlayed,
betsPlaced, totalWagered, totalPayout, ip, userAgent. Activity windows
(5 min → 30 day) are computed by indexed aggregate queries; nothing scans the
full transaction history on a request path.

## User Activity Timeline (`/api/admin/users/:id/timeline`)

Admin-only. Activity events ordered newest-first with batched hydration of the
linked transaction/bet/round (no N+1: three `IN` queries total). Every row can
drill down to its ledger entry, bet or round — the audit trail the spec requires.

## Privacy

- Players never see other players' emails, phones, balances, or risk data.
  Public bet lists use anonymized usernames (`abc***`).
- Risk scores and fraud indicators are admin-only.
- All analytics endpoints sit behind `authenticate + requireAdmin`.
