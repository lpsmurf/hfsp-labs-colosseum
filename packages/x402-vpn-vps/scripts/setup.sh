#!/usr/bin/env bash
set -euo pipefail

echo "=== vpn-x402 setup ==="

# Node 20
if ! command -v node &>/dev/null || [[ "$(node -e 'process.exit(parseInt(process.version.slice(1))>=20?0:1)')" != "" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Redis
if ! command -v redis-server &>/dev/null; then
  sudo apt-get install -y redis-server
  sudo systemctl enable redis-server
  sudo systemctl start redis-server
fi

# PM2
npm install -g pm2 tsx

# Install dependencies
cd "$(dirname "$0")/.."
(cd contracts && npm install)
(cd backend  && npm install)
(cd frontend && npm install)

# Copy env examples if not present
[[ -f backend/.env  ]] || cp backend/.env.example  backend/.env
[[ -f frontend/.env.local ]] || cp frontend/.env.local.example frontend/.env.local

# Nginx config
sudo cp nginx/vpn-x402.conf /etc/nginx/sites-available/vpn-x402
sudo ln -sf /etc/nginx/sites-available/vpn-x402 /etc/nginx/sites-enabled/vpn-x402
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "Setup complete. Next steps:"
echo "  1. Fill in backend/.env:"
echo "       PRIVATE_KEY, HETZNER_API_TOKEN, VPN_CONTRACT_ADDRESS, VPS_CONTRACT_ADDRESS"
echo "       SOLANA_RECEIVE_ADDRESS (optional, for Solana pay)"
echo "  2. Fill in frontend/.env.local:"
echo "       NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, NEXT_PUBLIC_SOLANA_RECEIVE_ADDRESS"
echo "  3. Deploy contracts: cd contracts && npm run deploy"
echo "       Then fill VPN_CONTRACT_ADDRESS + VPS_CONTRACT_ADDRESS in backend/.env"
echo "  4. Issue SSL: certbot --nginx -d vpn.hfsp.cloud"
echo "  5. Start: cd .. && bash scripts/deploy.sh"
