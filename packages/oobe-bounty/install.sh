#!/usr/bin/env bash
set -e

BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
RESET="\033[0m"

echo -e "${BOLD}${CYAN}▶ oobe-bounty installer${RESET}"

# --- locate package root (works from any directory) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --- pull latest code ---
echo -e "${CYAN}[1/5] Pulling latest code...${RESET}"
git -C "$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)" pull origin main

# --- write .env if it doesn't already have real credentials ---
echo -e "${CYAN}[2/5] Writing .env...${RESET}"
cat > .env << 'EOF'
ACEDATA_API_KEY=rIbhgtEaXnSsK1cnDD-dBvmcyRvO7I8I_eeursL1vmk
ACEDATA_FACILITATOR_ADDRESS=https://facilitator.acedata.cloud
WALLET_PUBLIC_KEY=G9PaCecm6XFVRR6xEaGL7dUbjGkPQauiBANAsGbs2swF
WALLET_PRIVATE_KEY=218,221,52,216,140,123,253,119,130,255,208,241,226,36,179,43,90,3,139,66,15,117,31,121,0,74,42,54,56,156,120,204,225,5,121,28,173,189,249,72,233,167,228,229,205,219,89,41,194,36,15,68,94,241,190,27,67,14,52,181,193,145,221,154
SOLANA_MAINNET_RPC=https://api.mainnet-beta.solana.com
SYNAPSE_RPC_URL=https://synapse.oobeprotocol.ai
PORT=8788
DATABASE_PATH=./data/bounty-vault.db
AGENT_INTERVAL_MS=300000
START_AGENTS=true
MOCK_ACEDATA=false
EOF

# --- install dependencies ---
echo -e "${CYAN}[3/5] Installing dependencies...${RESET}"
npm install --silent

# --- build TypeScript ---
echo -e "${CYAN}[4/5] Building...${RESET}"
npm run build

# --- start with pm2 ---
echo -e "${CYAN}[5/5] Starting with PM2...${RESET}"
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2 --silent
fi

pm2 delete oobe-bounty 2>/dev/null || true
pm2 start dist/server.js --name oobe-bounty
pm2 save

echo ""
echo -e "${GREEN}${BOLD}✅ oobe-bounty is running!${RESET}"
echo ""
echo "  Health:   curl http://localhost:8788/health"
echo "  Signals:  curl http://localhost:8788/api/signals"
echo "  Proof:    curl http://localhost:8788/api/proof"
echo "  Logs:     pm2 logs oobe-bounty"
