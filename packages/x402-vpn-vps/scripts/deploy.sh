#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "=== deploying vpn-x402 from $ROOT ==="

# Build backend
echo "[1/3] Building backend..."
cd "$ROOT/backend"
npm run build

# Build frontend
echo "[2/3] Building frontend..."
cd "$ROOT/frontend"
npm run build

# Restart with PM2
echo "[3/3] Restarting PM2 processes..."
cd "$ROOT"
pm2 startOrReload pm2.config.js --update-env
pm2 save

echo ""
echo "Deploy complete. Check status with: pm2 status"
