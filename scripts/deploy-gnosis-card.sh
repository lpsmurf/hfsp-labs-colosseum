#!/usr/bin/env bash
# Deploy gnosis-card-x402 to VPS
# Usage: bash scripts/deploy-gnosis-card.sh <vps-host>
# Example: bash scripts/deploy-gnosis-card.sh root@clawdrop.live

set -euo pipefail

HOST="${1:-root@clawdrop.live}"
REMOTE_DIR="/opt/hfsp-labs"

echo "▶ Building gnosis-card-x402..."
cd packages/gnosis-card-x402
npm install
npm run build
cd ../..

echo "▶ Syncing files to $HOST..."
rsync -az --delete \
  packages/gnosis-card-x402/dist/ \
  "$HOST:$REMOTE_DIR/packages/gnosis-card-x402/dist/"

rsync -az \
  packages/gnosis-card-x402/package.json \
  "$HOST:$REMOTE_DIR/packages/gnosis-card-x402/"

echo "▶ Syncing PM2 ecosystem..."
rsync -az config/vps/pm2/ecosystem.config.json "$HOST:$REMOTE_DIR/"

echo "▶ Syncing nginx config..."
rsync -az config/vps/nginx/conf.d/clawdrop.conf \
  "$HOST:/etc/nginx/conf.d/clawdrop.conf"

echo "▶ Reloading services on VPS..."
ssh "$HOST" bash << 'REMOTE'
  set -e
  cd /opt/hfsp-labs

  # Install prod deps
  cd packages/gnosis-card-x402 && npm install --omit=dev && cd ../..

  # Check .env exists
  if [ ! -f packages/gnosis-card-x402/.env ]; then
    echo "ERROR: /opt/hfsp-labs/packages/gnosis-card-x402/.env not found!"
    echo "Copy .env.example and fill in the values first."
    exit 1
  fi

  # Start/restart PM2 process
  pm2 start ecosystem.config.json --only gnosis-card-x402 || \
    pm2 restart gnosis-card-x402

  pm2 save

  # Reload nginx
  nginx -t && systemctl reload nginx

  echo "✓ gnosis-card-x402 deployed on :3002"
  echo "✓ nginx /gnosis-api/ → :3002/api/"
REMOTE

echo ""
echo "✅ Done. Test with:"
echo "   curl https://clawdrop.live/gnosis-api/bridge/quote -X POST -H 'Content-Type: application/json' \\"
echo "     -d '{\"direction\":\"sol_to_gnosis\",\"amountUsdc\":10,\"safeAddress\":\"0x737d274Cd37C7748615c98b809F58fab05E44A55\"}'"
