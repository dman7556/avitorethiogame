# Fraud Detection Model — SkyRush

## Principles

1. **Signals, not verdicts.** Six independent signals combine into a composite
   `risk_score` (0–100) with human-readable reasons. No single signal alone
   escalates a user.
2. **Explainable.** Every RiskEvent stores its reasons array, e.g.:
   `risk_score = 45 (HIGH)` → `UNUSUAL_TRANSACTION_VELOCITY: 158 transactions
   in the last hour`, `ABNORMAL_WITHDRAWAL_FREQUENCY: 11 withdrawal requests in 24h`.
3. **Flag for review, never silent punishment.** The engine cannot freeze a
   balance, reject a bet, or alter an outcome — it only writes `RiskEvent`
   rows and admin alerts. Humans act through the review workflow.
4. **False-positive safe.** Rate-limited assessment (≤ 1 full scan per user
   per 5 min, or 50 actions), conservative thresholds, level-change detection
   to avoid re-flagging.

## Signals

| Code | What it detects | Weight | Source |
|---|---|---|---|
| `UNUSUAL_TRANSACTION_VELOCITY` | >120 bets+deposits+withdrawals/hour | 10–40 | indexed counts |
| `RAPID_DEPOSIT_WITHDRAWAL_CYCLES` | ≥3 deposit→withdrawal cycles <10 min in 24h (payment abuse) | 20–45 | deposit/withdrawal records |
| `MULTI_ACCOUNT_TECHNICAL_OVERLAP` | IP/user-agent shared with ≥3/≥5 other accounts (7d) | 15–35 | UserSession fingerprints |
| `BOT_LIKE_TIMING` | metronomic bet timing (CV < 0.12) or <1.8s mean gaps | 35 | bet timestamps |
| `REPEATED_FAILED_AUTH` | ≥10 failed logins/hour (A TO indicator) | up to 30 | AUTH_FAILED_LOGIN events |
| `ABNORMAL_WITHDRAWAL_FREQUENCY` | >8 withdrawals/24h | 10–30 | withdrawal counts |

## Levels & Workflow

`LOW (0–24) · MEDIUM (25–49) · HIGH (50–74) · CRITICAL (75–100)`

- MEDIUM+ → an OPEN `RiskEvent` row with reasons (deduplicated by level).
- HIGH/CRITICAL → also a FRAUD admin alert (deduplicated per user).
- Admin workflow: `POST /api/admin/risk-events/:id/review` →
  `UNDER_REVIEW | CLEARED | CONFIRMED` with reviewer, timestamp, notes.
- Bot state derivation: `NORMAL | SUSPICIOUS | HIGH_RISK | UNDER_REVIEW | BLOCKED`
  (`deriveBotState`). `BLOCKED` is a **decision reserved for admins**, not an
  automatic state.

## Automation / Abuse Coverage

- Request flooding / API abuse → handled by the express-rate-limit layer
  (100 req/min default) + `UNUSUAL_TRANSACTION_VELOCITY`.
- Socket abuse → session fingerprinting + velocity signals.
- Credential attacks → `REPEATED_FAILED_LOGIN` from login-route events.
- Duplicate payment evidence / payment abuse → `RAPID_DEPOSIT_WITHDRAWAL_CYCLES`
  surfaces the pattern for manual deposit-review correlation.

## Guarantees

- Assessments never run inside financial transactions (async, post-commit).
- Every module call site is wrapped in catch-alls: fraud detection can never
  break betting, deposits, or withdrawals.
- Tests: `analytics.test.ts` asserts LOW for normal users, triggered signals
  for seeded abuse patterns, persistence of explainable reasons, and that a
  full assessment leaves the wallet byte-identical.
