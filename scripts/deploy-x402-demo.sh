#!/usr/bin/env bash
# Deploy @hfsp/x402-sdk demo to demo.hfsp.cloud
# Run from repo root: bash scripts/deploy-x402-demo.sh
set -euo pipefail

VPS_HOST="${VPS_HOST:-root@hfsp.cloud}"
REMOTE_DIR="/opt/hfsp-labs"

echo "=== Building x402-sdk ==="
cd packages/x402-sdk
npm run build
cd ../..

echo "=== Building x402-demo ==="
cd packages/x402-demo
npm install
npm run build
cd ../..

echo "=== Syncing to VPS ==="
rsync -avz --exclude='node_modules' --exclude='.git' \
  packages/x402-sdk/   "$VPS_HOST:$REMOTE_DIR/packages/x402-sdk/"
rsync -avz --exclude='node_modules' --exclude='.git' \
  packages/x402-demo/  "$VPS_HOST:$REMOTE_DIR/packages/x402-demo/"
rsync -avz \
  config/nginx/conf.d/demo.conf  "$VPS_HOST:/etc/nginx/conf.d/demo.conf"

echo "=== Linking local SDK in demo on VPS ==="
ssh "$VPS_HOST" "cd $REMOTE_DIR/packages/x402-demo && npm install --no-audit 2>&1"

echo "=== Issuing TLS cert (if not yet issued) ==="
ssh "$VPS_HOST" "set +e; output=\$(certbot certonly --nginx -d demo.hfsp.cloud --non-interactive --agree-tos -m info@hfsp.xyz 2>&1); status=\$?; if [ \$status -ne 0 ]; then if printf '%s\\n' \"\$output\" | grep -Eq 'Certificate already exists|already been issued|already exists'; then echo 'cert already exists'; else printf '%s\\n' \"\$output\" >&2; exit \$status; fi; fi"

echo "=== Reloading nginx ==="
ssh "$VPS_HOST" "nginx -t && systemctl reload nginx"

echo "=== Restarting PM2 process ==="
ssh "$VPS_HOST" "cd $REMOTE_DIR && pm2 reload ecosystem.config.json --only x402-demo --update-env || pm2 start ecosystem.config.json --only x402-demo"

echo ""
echo "✓  demo.hfsp.cloud is live"
echo "   curl https://demo.hfsp.cloud/health"
