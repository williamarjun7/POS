#!/bin/bash
set -euo pipefail

# ── Load environment ──────────────────────────────────────────
[ -f .env ] && set -a && source .env && set +a

# ── Server config (with defaults) ─────────────────────────────
SERVER_HOST="${SERVER_HOST:-103.233.58.46}"
SERVER_USER="${SERVER_USER:-highlandscafe}"
SERVER_DIR="/var/www/pos"

# ── Required secrets (fail early if missing) ──────────────────
: "${VITE_INSFORGE_URL:?Must be set in .env or environment}"
: "${VITE_INSFORGE_ANON_KEY:?Must be set in .env or environment}"
: "${VITE_FONEPAY_MERCHANT_CODE:?Must be set in .env or environment}"
: "${VITE_FONEPAY_API_BASE_URL:?Must be set in .env or environment}"

echo "Deploying to $SERVER_USER@$SERVER_HOST:$SERVER_DIR"

# ── Deploy via SSH ────────────────────────────────────────────
ssh "$SERVER_USER@$SERVER_HOST" << DEPLOY
set -euo pipefail

cd /var/www/pos
echo "=== Deploying \$(date) ==="
echo "Current commit: \$(git -C /var/www/pos log --oneline -1 || echo 'unknown')"

echo "→ Fetching and resetting to origin/main..."
sudo git fetch origin main
sudo git reset --hard origin/main
echo "Updated to: \$(git -C /var/www/pos log --oneline -1)"

echo "→ Installing dependencies..."
sudo npm install

echo "→ Building..."
sudo VITE_INSFORGE_URL='${VITE_INSFORGE_URL}' \
  VITE_INSFORGE_ANON_KEY='${VITE_INSFORGE_ANON_KEY}' \
  VITE_FONEPAY_MERCHANT_CODE='${VITE_FONEPAY_MERCHANT_CODE}' \
  VITE_FONEPAY_API_BASE_URL='${VITE_FONEPAY_API_BASE_URL}' \
  npx vite build

echo "→ Reloading nginx..."
sudo systemctl reload nginx

echo "✅ Deploy complete! Now serving: \$(git -C /var/www/pos log --oneline -1)"
DEPLOY
