#!/usr/bin/env bash
# Skyrush — Oracle VM provisioning (run ONCE on the VM, as root, from repo root)
# Idempotent: safe to re-run. Never touches the database or any data.
set -euo pipefail

DOMAIN="${1:?Usage: ./deploy/oracle/provision.sh <backend-domain>}"
APP_DIR=/opt/skyrush
SERVICE_USER=skyrush

echo "── 1. Node.js 20 (NodeSource) ─────────────────────────────"
if command -v node >/dev/null && [[ "$(node -v)" == v20.* ]]; then
  echo "node $(node -v) already installed"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "── 2. nginx + certbot ─────────────────────────────────────"
apt-get update -qq
apt-get install -y nginx certbot python3-certbot-nginx

echo "── 3. Service user + app dir ──────────────────────────────"
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --create-home --home "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$APP_DIR" /etc/skyrush
touch /etc/skyrush/backend.env
chmod 600 /etc/skyrush/backend.env
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

echo "── 4. Code sync (rsync, node_modules excluded) ────────────"
# From the LOCAL machine instead run:
#   rsync -avz --exclude node_modules --exclude .git --exclude .freebuff \
#     ./ "user@VM:/opt/skyrush/"
rsync -a "$APP_DIR/" "$APP_DIR/" 2>/dev/null || true

echo "── 5. Install + build (exact project scripts) ─────────────"
cd "$APP_DIR"
sudo -u "$SERVICE_USER" env NODE_ENV=production npm ci
sudo -u "$SERVICE_USER" env NODE_ENV=production npm run build -w packages/shared -w apps/server
# Prisma client generation (bundled in postinstall/npm scripts; verify):
sudo -u "$SERVICE_USER" npx prisma generate --schema=prisma/schema.prisma || true
test -f "$APP_DIR/apps/server/dist/apps/server/src/index.js" || { echo "FATAL: build output missing"; exit 1; }

echo "── 6. systemd unit ────────────────────────────────────────"
cp deploy/oracle/skyrush-backend.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable skyrush-backend

echo "── 7. nginx vhost (HTTP first; certbot upgrades to HTTPS) ─"
sed "s/__DOMAIN__/${DOMAIN}/g" deploy/oracle/nginx-skyrush.conf > /etc/nginx/sites-available/skyrush
# Start without TLS blocks so certbot --nginx can issue the first cert:
sed -i '/listen 443 ssl/,/ssl_protocols/d' /etc/nginx/sites-available/skyrush
ln -sf /etc/nginx/sites-available/skyrush /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "── 8. TLS certificate ─────────────────────────────────────"
certbot --nginx -d "$DOMAIN" --redirect --non-interactive --agree-tos -m "admin@${DOMAIN#*.}" || {
  echo "WARN: certbot failed — check DNS A record for ${DOMAIN} points at this VM"
}

echo "── 9. Firewall (Oracle list + ufw) ────────────────────────"
# Oracle Cloud security list must also allow TCP 80,443 (console → VNIC).
if command -v ufw >/dev/null; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi
# 8080 must NOT be publicly reachable — verify with the checklist in RUNBOOK.md

echo "DONE. Next: fill /etc/skyrush/backend.env (see RUNBOOK.md §4), then:"
echo "  systemctl start skyrush-backend && journalctl -u skyrush-backend -f"
