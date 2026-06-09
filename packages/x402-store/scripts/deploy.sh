#!/bin/bash
# Deploy x402-store to the existing VPS (same server as vpn.hfsp.cloud)
# Run as root on the VPS: bash packages/x402-store/scripts/deploy.sh
set -e

INSTALL_DIR="/opt/hfsp-labs"
PKG="packages/x402-store/backend"
DOMAIN="store.hfsp.cloud"
NGINX_CONF="/etc/nginx/conf.d/store-hfsp.conf"
ENV_FILE="$INSTALL_DIR/$PKG/.env"

echo "=== x402-store deploy ==="

# Pull latest code
cd "$INSTALL_DIR"
git pull

# Install deps and build
cd "$INSTALL_DIR/$PKG"
npm install --omit=dev
npm run build

# Place .env if not already there
if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo "ERROR: $ENV_FILE not found."
  echo "Create it before running deploy:"
  echo "  cp $INSTALL_DIR/$PKG/.env.example $ENV_FILE"
  echo "  nano $ENV_FILE   # fill in STORE_SOLANA_PRIVATE_KEY + HELIUS_RPC_URL"
  exit 1
fi

# Nginx config
cp "$INSTALL_DIR/config/vps/nginx/conf.d/store.conf" "$NGINX_CONF"
nginx -t
systemctl reload nginx

# SSL cert (skip if already issued)
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m info@hfsp.xyz
fi

# PM2 — start or reload
if pm2 describe x402-store > /dev/null 2>&1; then
  pm2 reload x402-store
else
  cd "$INSTALL_DIR"
  pm2 start "$INSTALL_DIR/$PKG/dist/index.js" \
    --name x402-store \
    --cwd "$INSTALL_DIR" \
    --env production
fi

pm2 save

echo ""
echo "=== Done ==="
echo "  https://$DOMAIN/health"
echo "  https://$DOMAIN/openapi.json"
echo "  https://$DOMAIN/.well-known/x402"
