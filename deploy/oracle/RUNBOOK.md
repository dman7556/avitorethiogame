# Skyrush — Oracle Cloud Backend Deployment Runbook

Single VM, single Node process, nginx TLS termination. **The game engine keeps
round state in memory → exactly ONE backend instance, forever.** No PM2 cluster,
no replicas, no autoscaling of this service.

Target flow:

```
Browser → Vercel (frontend) → HTTPS :443 → nginx → Node :8080 → Supabase PostgreSQL
                                            └→ /socket.io/ (websocket upgrade)
                                            └→ Cloudinary (image CDN)
```

---

## 1. Prerequisites

| Item | Detail |
|---|---|
| VM | Oracle Cloud Ubuntu 22.04/24.04 (Ampere A1 or x86), ≥2 GB RAM |
| DNS | `A` record: `<backend-domain>` → VM public IP, propagated **before** certbot |
| Oracle Security List | Ingress: TCP 22 (SSH), 80, 443. **Never 8080.** |
| Access | SSH key for a sudo-capable user (`ubuntu` by default on OCI images) |

> This repo ships **no VM credentials and no VM address**. Supply them yourself
> when running the commands in §2.

## 2. Deploy (from the local repo root)

```bash
# 2.1 Push the code (no secrets ever transit this step — .env files are excluded)
rsync -avz --exclude node_modules --exclude .git --exclude .freebuff \
  --exclude '.env*' --exclude dist \
  ./ "$USER@$VM_IP:/opt/skyrush/"

# 2.2 Provision (Node 20, nginx, certbot, systemd, firewall) — idempotent
ssh "$USER@$VM_IP" "cd /opt/skyrush && sudo ./deploy/oracle/provision.sh <backend-domain>"
```

## 3. Production build (on the VM — exact verified commands)

The local Phase-2 verification proved this exact pipeline boots and serves:

```bash
cd /opt/skyrush
npm ci                                  # installs + generates Prisma client
npm run build -w packages/shared -w apps/server
# → apps/server/dist/apps/server/src/index.js   (tsc mirrors the monorepo layout)
```

⚠️ The start file is **`dist/apps/server/src/index.js`** — *not* `dist/index.js`
(the tsconfig has no `rootDir`, so output mirrors the workspace tree).

## 4. Environment (on the VM — secrets stay here, never in git)

Edit `/etc/skyrush/backend.env` (root:root, mode 600, loaded by systemd).
Variable **names** come from `.env.example` — copy values from the existing
`apps/server/.env` at deploy time:

```
NODE_ENV=production
PORT=8080
CLIENT_URL=https://<vercel-frontend-domain>       # primary Vercel origin
CLIENT_URLS=https://<vercel-frontend-domain>,https://www.<...>  # extras (previews)
PUBLIC_BASE_URL=https://<backend-domain>          # prefixes legacy /uploads URLs
DATABASE_URL=<supabase pooler :6543>
DIRECT_DATABASE_URL=<supabase direct :5432>
SUPABASE_URL=<configured>
SUPABASE_ANON_KEY=<configured>
SUPABASE_SERVICE_KEY=<configured>
CLOUDINARY_CLOUD_NAME=<configured>
CLOUDINARY_API_KEY=<configured>
CLOUDINARY_API_SECRET=<configured>
EMAIL_HOST=<configured>
EMAIL_PORT=<configured>
EMAIL_USER=<configured>
EMAIL_PASSWORD=<configured>
EMAIL_FROM=<configured>
```

Then:

```bash
sudo systemctl enable --now skyrush-backend
sudo journalctl -u skyrush-backend -f        # expect: health server + GameEngine rounds
```

## 5. Verify

```bash
./deploy/oracle/verify.sh https://<backend-domain> https://<vercel-frontend-domain>
```

Checks (all real requests, PASS/FAIL): health 200 · valid TLS cert · CORS echo
of the frontend origin · CORS rejection of foreign origins · socket.io handshake
through nginx · port 8080 not publicly exposed.

Manual (requires a browser pointed at the live Vercel app): socket **auth** with a
real login token, round events arriving, reconnect after `sudo systemctl restart
skyrush-backend`.

## 6. Update / rollback the app

```bash
# Update: re-run §2.1 rsync + §3 build, then
sudo systemctl restart skyrush-backend

# Rollback code: keep the previous build before replacing it
sudo -u skyrush cp -r apps/server/dist /opt/skyrush-backups/dist-$(date +%F-%H%M)
# restore = copy back + restart. Supabase data is never touched by either.
```

## 7. Rollback to local/development state

Stop the VM service (`sudo systemctl disable --now skyrush-backend`) — nothing
else. The Supabase DB keeps its data; the local dev stack (Vite 5173 ↔ Node
4000 via the VBS launchers in `.freebuff/run.md`) is untouched and already
verified against the same database.

## 8. Single-instance guarantee

- systemd unit runs exactly one `node` process (`Type=simple`, no cluster).
- Never run a second unit, second VM, PM2 cluster, or container replica: the
  in-memory game engine would create conflicting rounds.
- After any restart, confirm exactly one process:
  `pgrep -fc "dist/apps/server/src/index.js"` → `1`
