# Tracked Follow-ups (logged 2026-09-20, not fixed in the audit pass)

These two issues were deliberately NOT fixed in the Performance & Connection-Interruption
batch, per instruction. They are pre-existing repo hygiene problems that have caused
repeated verification confusion this session (M-series audits and Fix 6).

## 1. `prisma migrate dev` is broken — provider mismatch

- **Symptom:** `prisma/migrations/migration_lock.toml` says `provider = "postgresql"`,
  but the dev datasource is SQLite (`provider = "sqlite"` in `prisma/schema.prisma`).
  Any `prisma migrate dev` run fails on the provider mismatch.
- **Current workaround:** `npm run db:push` (schema push without migration history).
  Fix 6's migration (`20260919120000_add_user_created_at_composite_indexes`) was applied
  to the dev DB with `prisma db execute` + verified via direct `sqlite_master` query.
- **Why it matters:** before the first production schema migration, the lock file and
  migration history must be reconciled with the real production provider (Supabase
  Postgres per env config), or `migrate deploy` will misbehave.
- **Suggested fix (out of scope here):** decide the canonical provider, regenerate the
  lock file, and baseline the existing migration history against both environments.

## 2. Multiple dev.db files — which one is "real" varies by entry point

- **Observed files:** `prisma/dev.db`, `prisma/prisma/dev.db`, and repo-root `dev.db`.
- **Root cause candidates:** the root `.env` `DATABASE_URL` vs. the server's own
  `apps/server/.env` (`file:../dev.db`, resolved relative to the generated client's
  schema dir) — the effective file depends on which env wins at runtime.
- **Verified this session:** the *runtime* DB used by the API server was the
  **repo-root `dev.db`** (fresh mtime every round; rounds persist there). Seeds run
  against either `prisma/dev.db` path did not affect the running server — this caused
  two false "admin login rejected" detours.
- **Suggested fix (out of scope here):** keep exactly one DATABASE_URL definition,
  make it absolute or anchor it to the server package, and delete the stale duplicate
  files after confirming nothing references them. Until then: to seed/inspect the
  live DB, find the file with the freshest mtime while rounds are running, or run
  seeds with the same env the server process uses.

## Also noted (minor, same category)

- Running the server test suite while the dev game engine is live against the same
  SQLite DB causes a rare `roundNumber` unique-constraint flake in `gameRound.create`
  (test picks a random roundNumber; the live engine increments its own). Stop the dev
  server for clean certification runs, or give tests a dedicated DATABASE_URL.
