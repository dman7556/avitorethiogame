# Responsible Gaming Model — SkyRush

## Purpose & Boundaries

Player-safety monitoring that prioritizes wellbeing and regulatory readiness.
It **only observes and notifies** — it never changes game outcomes, never
blocks a bet, and never moves money. Interventions take the form of alerts for
human review and per-user notifications, which is the appropriate layer for
this platform today (see "Next steps" for self-service tools).

## Monitored Patterns & Alerts

| Check | Trigger (24h unless noted) | Alert | Severity |
|---|---|---|---|
| Long session | single session ≥ `maxSessionMinutes` (default 240) | `rg:session:{id}` | WARNING (HIGH if overnight 23:00–05:00 start) |
| Deposit frequency | ≥5 approved deposits | `rg:deposit:freq:{userId}` | WARNING |
| Deposit escalation | latest approved deposit ≥3× 24h median and >1000 ETB | `rg:deposit:escalation:{userId}` | WARNING |
| Loss-chasing | ≥25 losing bets AND ≥2000 ETB lost AND ≥3 deposits after | `rg:chasing:{userId}` | HIGH |
| High-frequency play | ≥150 bets in the last hour | `rg:freq:{userId}` | WARNING |

All alerts are category `RESPONSIBLE_GAMING`, deduplicated per user/pattern,
and carry drill-down metadata (`linkType: USER`).

## Data Sources

- `UserSession` (startedAt, lastActivityAt, wagered/payout aggregates) — sessions
- `Deposit` (approved, with timestamps & amounts) — frequency & escalation
- `Bet` (LOST status, amounts, timestamps) — loss-chasing
- Thresholds live in the `alertThresholds` SystemSetting (admin-editable via
  `GET/PUT /api/admin/alert-thresholds`); nothing is hardcoded client-side.

## Alerts in the UI

Admin → Live Analytics & Risk → **Alerts**: realtime arrival via `admin:alert`,
severity-styled cards, one-click Resolve (audited with resolver + timestamp),
and jump-to-user-timeline for context.

## Next Steps (recommended, not yet implemented)

- Player-facing tools: session reminders, deposit limits, cool-off/self-exclusion.
- These require product decisions (limits granularity, regulatory jurisdiction)
  and belong above the analytics layer — the monitoring here already provides
  the data they would need.
