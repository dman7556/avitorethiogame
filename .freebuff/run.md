# SkyRush Aviator - Preview Setup

## How to Reproduce Uncommitted Artifacts

1. Copy `.env` from the main checkout (`C:\Users\hp\Desktop\avatior one`) into the worktree root.
   - `apps/server/.env` also exists and is used by the backend (it sets `PORT=4000`).
   - The run doc records the PROCEDURE only — never the secret values themselves.
2. Install dependencies with npm: `npm install` (workspaces: `packages/*`, `apps/*`).
3. Ensure Prisma client is generated: `npx prisma generate`.
4. Ensure the SQLite DB exists at the repo root (`dev.db`) — if missing, see "Database schema drift" below.

## How to Run the Server

### Development Mode (both server and web)

```bash
npm run dev
```

This runs the Express/Socket.IO backend (port 4000) and the Vite dev server (port 5173) concurrently.

- Server Only: `npm run dev:server` · Web Only: `npm run dev:web`
- Env variables: see `.env.example`. Key ones: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_KEY`, `SUPABASE_DB_URL`, `JWT_SECRET`, `PORT` (backend), `CLIENT_URL`
  (must match the web origin), `CLOUDINARY_*` (screenshot uploads).

### CRITICAL: ambient `PORT=0` environment leak (2026-09-13)

The desktop app's shell exports **`PORT=0`** (and possibly other vars) into every
child process. The backend loads `.env` with dotenv **without override**, so an
ambient `PORT=0` wins over both `.env` files (`PORT=4000` / `PORT=3001`) and the
server binds **port 0** — it logs `🚀 Aviator server running on http://localhost:0`,
the game engine still runs (rounds keep being created!), but nothing is reachable
and `netstat` shows no 4000 listener. The Vite proxy then fails with
`ECONNREFUSED` on every `/api/*` request.

**Fix: always launch with `PORT=4000` in the environment** (see launch commands
below). Also keep `CLIENT_URL` consistent with the chosen Vite port so Socket.IO
CORS accepts the web origin (`http://localhost:5173` by default).

### Ports (verified 2026-09-13)

- Server: **4000** — matches `apps/web/vite.config.ts` proxy targets and the
  socket URL fallback in `apps/web/src/contexts/GameContext.tsx`. The `.env`
  files disagree (root: 3001, server: 4000); 4000 is the one the frontend expects.
- Web: **5173** — the project default and currently FREE on this machine
  (the previously-occupying Vite instance from `C:\Users\hp\Desktop\19s` is gone).
  If 5173 becomes occupied again, start Vite with `--port 5174 --strictPort` and
  set `CLIENT_URL=http://localhost:5174` for the backend.
- Do NOT use 8080: it is bound by Oracle TNSLSNR.EXE (TNS listener) and returns 401.

### Database schema drift (P2022 `GameRound.serverSeedHash` missing)

The server resolves `DATABASE_URL` as **`SUPABASE_DB_URL || DATABASE_URL`**
(`apps/server/src/lib/env.ts`); both .env files set `SUPABASE_DB_URL` to a Postgres
URL, so Prisma silently falls back to SQLite. `prisma db push` MUST be run from
`apps/server/` so the schema lands in `<root>/dev.db` (the file the server opens).
Running it from the repo root instead pushes to `prisma/prisma/dev.db` (wrong file)
and the server then crashes on boot with `P2022`.

```bash
# correct (fresh-clone verified 2026-09-17 — plain `npx prisma db push`
# from apps/server FAILS there with "Could not find Prisma Schema"):
cd apps/server && npx prisma db push --schema ../../prisma/schema.prisma
# also stale-prone: cd <root> && npx prisma db push  ← touches prisma/prisma/dev.db
```

### Fresh-clone verification procedure (verified end-to-end 2026-09-17)

A fresh `git clone` + `npm install` is NOT enough to run tests. In order:

1. `cp` both env files from the main checkout: root `.env` and `apps/server/.env`.
2. `cd apps/server && npx prisma generate --schema ../../prisma/schema.prisma`
   (a bare `npx prisma generate` fails to locate the root schema in a fresh clone).
3. Schema push — the corrected command from the section above.
4. **DATABASE_URL must be an absolute `file:` URL for vitest runs.** The shipped
   relative value (`file:../dev.db`) resolves against each vitest worker's cwd and
   can land on a tableless file, failing ~28 DB tests with
   `Environment variable not found` / `table main.User does not exist`.
   Export it for the run: `DATABASE_URL="file:<absolute>/dev.db"` (both slashes
   forward-slash form on Windows work).
5. `npm run db:seed` (same DATABASE_URL export) — `analytics.test.ts` asserts
   `totalUsers > 0`, so an empty freshly-pushed DB fails one test without a seed.
6. `npm run build` (builds `packages/shared` first — required for web tsc),
   then `npx vitest run` from `apps/server`.

Known hermeticity gap: `dashboard payload returns real aggregates` depends on
seeded users existing; it is the only test that is not fresh-DB-clean.

### Detached start (Windows)

`cmd /c ...` wrappers here die from console ctrl events (log shows "Terminate
batch job" / ^C) when the launching shell's command times out. Launch detached
instead. Two working options:

**Option A — PowerShell Start-Process (used successfully 2026-09-13):**

```bash
# Prefix with PORT=4000 — REQUIRED (see "PORT=0 leak" above). The command often
# does NOT return before the shell timeout; that is expected — the process
# starts anyway. Never wait on it; verify with netstat instead.
PORT=4000 powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' \
  -ArgumentList 'run','dev' \
  -RedirectStandardOutput '<log>' -RedirectStandardError '<log>.err' \
  -WindowStyle Hidden -PassThru).Id"
```

stdout and stderr MUST go to different files (PowerShell refuses one path for both).
The printed pid may be lost if the call times out — recover it via:
`Get-CimInstance Win32_Process -Filter "Name='node.exe'"` matching `concurrently.js`.

**Option C — VBS hidden-console launcher (MOST RELIABLE; proven 2026-09-20):**

Both Options A and B children share the launching console and get reaped
(0xC000013A STATUS_CONTROL_C_EXIT) whenever a later tool call times out.
The WScript launcher gives the child its OWN hidden console, immune to that.
Launchers live in `C:/Users/hp/.freebuff-tmp/` (`run-server.vbs`, `run-vite.vbs`):

```vbs
' run-server.vbs — child gets an isolated hidden console
CreateObject("WScript.Shell").Run _
  "cmd /c ""cd /d C:\Users\hp\Desktop\avatior one\apps\server && " & _
  "set PORT=4000 && npx tsx src/index.ts""", 0, False
```

(vite variant: `cd /d ...apps\web && npx vite --port 5173`.)
Launch synchronously — cscript returns immediately by design:

```bash
cscript //nologo "C:/Users/hp/.freebuff-tmp/run-server.vbs"
cscript //nologo "C:/Users/hp/.freebuff-tmp/run-vite.vbs"
sleep 14; curl -s --max-time 4 -o /dev/null -w "api:%{http_code} " \
  http://localhost:4000/api/health; \
  curl -s --max-time 4 -o /dev/null -w "vite:%{http_code}\n" http://localhost:5173
```

Do NOT background the cscript call with `&` — a Git-Bash subshell parent can
be torn down before it spawns node (observed: "no node process" failures).
Find pids afterwards via netstat, not from the launcher.

**Option B — node.exe direct spawn (alternative):**

```bash
node -e "
const { spawn } = require('child_process'); const fs = require('fs');
const root = 'C:/Users/hp/Desktop/avatior one';
const server = spawn(process.execPath,
  [root + '/node_modules/tsx/dist/cli.mjs', 'watch', 'src/index.ts'],
  { cwd: root + '/apps/server', detached: true, windowsHide: true,
    env: { ...process.env, PORT: '4000', CLIENT_URL: 'http://localhost:5173' },
    stdio: ['ignore', fs.openSync(root + '/.freebuff/preview-server.log', 'a'),
            fs.openSync(root + '/.freebuff/preview-server.log.err', 'a')] });
server.unref();
const vite = spawn(process.execPath,
  [root + '/node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--port', '5173'],
  { cwd: root + '/apps/web', detached: true, windowsHide: true,
    stdio: ['ignore', fs.openSync(root + '/.freebuff/preview-vite.log', 'a'),
            fs.openSync(root + '/.freebuff/preview-vite.log.err', 'a')] });
vite.unref();
console.log('pids', server.pid, vite.pid);
"
```

**Before starting, check for stale processes.** A crashed/`PORT=0` backend can
leave an orphaned `tsx watch` tree whose game engine keeps running invisibly
(listening on port 0 → no netstat trace). Two engines on one SQLite DB corrupt
round state. Check and clean:

```bash
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object CommandLine -match 'avatior' | Select-Object ProcessId,CommandLine"
netstat -ano | grep -E ":(4000|5173)" | grep LISTEN
# then: taskkill //F //PID <pid> //T   (for every stale tree, incl. concurrently/npm/vite)
```

If a server `.err` log shows a fresh P2022: stop, run the schema push above, relaunch.
If a command against the server hangs/times out: its console may have received a
ctrl event — check `netstat -ano | findstr ":4000"` and restart if gone.

### Interactive start (foreground)

```bash
# terminal 1 — backend (note the env overrides)
cd apps/server && PORT=4000 CLIENT_URL=http://localhost:5173 npx tsx watch src/index.ts

# terminal 2 — frontend
cd apps/web && npx vite --host 0.0.0.0 --port 5173
```

Health check: `curl http://localhost:5173/api/health` (proxied to the server) should
return `{"status":"ok",...}`. Then confirm the game page renders: the multiplier
count-up, two bet slots, and `[Socket] Connected` / `[AUDIO_EVENT] FLIGHT_START`
in the browser console.

## Money-flow audit harness (2026-09-21)

Node scripts in `.freebuff/` used for the live withdrawal/deposit re-audit.
Run each with `node --env-file=apps/server/.env <script>` from the repo root;
the server must be up on port 4000.

- `money-audit-auth.mjs` — REST auth helpers (Supabase signin + API wrappers)
- `audit-setup.mjs` — creates audit user/admin via real /api/auth/register,
  elevates admin by flipping role in SQLite, saves `.freebuff/audit-identities.json`
- `audit-repro.mjs` — withdrawal lifecycle: seed 1000, submit 300 (real API),
  overdraw-probe bet while pending (socket), admin approve, second user reject,
  reconciliation check, ledger dumps
- `audit-deposit.mjs` — deposit flow: reject credits nothing, approve credits
  exact amount, H1 dual-control matrix (self/retry/mismatch/second-admin)
- `audit-h4-c1.mjs` — H4 3-pending cap via real API; C1 ten concurrent cashouts
  on one bet (exactly-once)
- `audit-damage.mjs` — quantifies historical overpayment from the fixed bug

Regression suite: `apps/server/src/__tests__/withdrawal-lifecycle-regression.test.ts`
(`npx vitest run` from apps/server).

## Supabase PostgreSQL migration (2026-09-21)

The app now runs against **Supabase Postgres** (migrated from SQLite). SQLite
`dev.db` is untouched and kept as rollback reference.

- Backups: `.freebuff/backups/pre-pg-migration-dev.db` (byte copy, sha1
  76f1119f30b07964937e1fbb78c39f5d10762fea) + `.freebuff/backups/pre-pg-migration-dump.sql`
  (full SQL dump) + `pre-pg-migration-server.env`.
- Schema: `prisma/schema.prisma` is `provider = "postgresql"` with
  `url = DATABASE_URL` (pooler :6543, pgbouncer) and `directUrl =
  DIRECT_DATABASE_URL` (direct :5432, no pgbouncer — used by CLI/migrations/tests).
- Data copy: `.freebuff/pg-migrate-data.cjs` (run inside the `avatior one - pg`
  worktree) — re-runnable, epoch-millis→ISO timestamp normalization, decimals as
  strings. Verify with `.freebuff/pg-verify-integrity.cjs` (counts, PK/FK, money
  checksums — all green, 30,948 rows).
- Rollback: restore the two .env DATABASE_URL lines from the ROLLBACK comments,
  `git checkout` the sqlite schema (or copy schema.prisma from the backup env),
  `npx prisma generate`. dev.db files were never modified.
- Tests vs Postgres: use the DIRECT URL for both DATABASE_URL and
  DIRECT_DATABASE_URL + `--testTimeout 180000` (WAN latency); interactive
  transactions now default to 30s via `transactionOptions` in lib/prisma.ts.

# Phase 2 — Vercel Frontend ↔ Oracle Backend (2026-09-21)

Code/config is deployment-ready; **no deployment has been performed**.

## Strategy chosen: Option B (central config helper)
`apps/web/src/lib/config.ts` is the single source of truth:
- Dev (no/localhost `VITE_API_URL`): REST = relative paths via Vite proxy; sockets
  = `window.location.origin` (proxied, ws:true). No hardcoded localhost in app code.
- Prod (`VITE_API_URL=https://<oracle-domain>` set in **Vercel env**): REST and
  sockets go straight to the Oracle origin. Never hardcode the domain in source.

## Wiring
- ALL `fetch('/api/...')` sites (~50) + 4 Socket.IO init sites (GameContext,
  ProvablyFairPage, AnalyticsSection, useSocketAdminEvents) use `apiUrl()` /
  `socketOrigin()` from config.ts. ProvablyFairPage `window.location.origin`
  production bug FIXED.
- Legacy `/uploads/...` screenshot URLs (12 DB rows) resolve against the backend
  origin via `uploadUrl()`; new deposits are absolute Cloudinary URLs (returned
  unchanged).
- Backend: CORS allow-list = `CLIENT_URL` + `CLIENT_URLS` (comma-separated,
  Express + Socket.IO), `trust proxy 1` for single reverse proxy, `normalizeStoredUrl`
  in cloudinary.service prefixes relative screenshot URLs with `PUBLIC_BASE_URL`.
- Vercel: `vercel.json` SPA fallback only (NO /api rewrites — keeps Oracle domain
  out of the repo; it lives in Vercel env vars). Templates: `.env.example`,
  `apps/web/.env.example`.

## Production simulation (verified 2026-09-21, 10/10 PASS)
Backend :4000 with CLIENT_URL=http://localhost:4173 + CLIENT_URLS (multi-origin
test); frontend = **prod build** with `VITE_API_URL=http://localhost:4000` baked
in, served by `vite preview --port 4173`. Verified: CORS preflight echo + evil-
origin block, registration, Bearer auth/me + wallet, public rounds, Socket.IO
connect from prod origin + evil-origin socket block, legacy /uploads 200 image/png.
Script: `.freebuff/phase2-sim.mjs` (re-runnable; requires sim stack up).

## Local dev (unchanged)
5173 (Vite) ↔ 4000 (backend) via the VBS launchers above — re-verified after
Phase 2 changes: api:200, vite:200, game rounds live in preview.

## Phase 2 env templates (never commit real values)
Vercel (public): `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
Oracle (private): NODE_ENV, PORT, CLIENT_URL, CLIENT_URLS, PUBLIC_BASE_URL,
DATABASE_URL, DIRECT_DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY,
SUPABASE_SERVICE_KEY, JWT_SECRET, CLOUDINARY_*, EMAIL_*.

# Phase 3 — Oracle Backend Deployment Package (2026-09-21)

No VM access existed on this machine (no SSH keys, no OCI CLI, no recorded host),
so the deployment itself was NOT executed. Everything is packaged for copy-paste
execution in `deploy/oracle/`:

- `RUNBOOK.md` — full step-by-step (rsync code → provision.sh → backend.env →
  systemd → certbot → verify), rollback + single-instance guarantees
- `provision.sh` — idempotent VM setup: Node 20, nginx, certbot, systemd, ufw
- `skyrush-backend.service` — single-instance unit; start file is
  `apps/server/dist/apps/server/src/index.js` (tsc mirrors monorepo layout —
  verified by booting the compiled output against real Supabase: health 200 +
  GameEngine rounds; auto-killed after 12s)
- `nginx-skyrush.conf` — TLS termination, Socket.IO websocket upgrade map,
  per-location proxying, 8080 never public
- `verify.sh` — post-deploy public checks (health, TLS, CORS echo/block,
  socket handshake, port exposure)
- Node pinned: `.nvmrc` (20) + root `engines` (>=20 <21); `.gitignore` now
  excludes `.env.production` / `.env.*.local`
