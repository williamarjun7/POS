#!/bin/bash
set -euo pipefail

SERVER_HOST="${SERVER_HOST:-103.233.58.46}"
SERVER_USER="${SERVER_USER:-highlandscafe}"
SERVER_DIR="/var/www/pos"

echo "Deploying to $SERVER_USER@$SERVER_HOST:$SERVER_DIR"

ssh "$SERVER_USER@$SERVER_HOST" << 'DEPLOY'
set -euo pipefail

cd /var/www/pos
echo "=== Deploying $(date) ==="
echo "Current commit: $(git -C /var/www/pos log --oneline -1 || echo 'unknown')"

echo "→ Fetching and resetting to origin/main..."
sudo git fetch origin main
sudo git reset --hard origin/main
echo "Updated to: $(git -C /var/www/pos log --oneline -1)"

echo "→ Installing dependencies..."
sudo npm install

echo "→ Building..."
sudo VITE_INSFORGE_URL='https://659pq3pb.us-east.insforge.app' \
  VITE_INSFORGE_ANON_KEY='anon_4b74cc35c99160bc644f9faca7944a27f53d031e05dadb283385e0134f340a17' \
  VITE_FONEPAY_MERCHANT_CODE='2222410020986773' \
  VITE_FONEPAY_API_BASE_URL='https://merchantapi.fonepay.com/api' \
  npx vite build

echo "→ Reloading nginx..."
sudo systemctl reload nginx

echo "✅ Deploy complete! Now serving: $(git -C /var/www/pos log --oneline -1)"
DEPLOY
