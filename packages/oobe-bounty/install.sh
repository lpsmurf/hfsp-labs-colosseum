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
if [ -f .env ]; then
  echo -e "${CYAN}  .env already exists — skipping (edit manually if needed)${RESET}"
else
  cp .env.example .env
  echo -e "${CYAN}  Created .env from .env.example — fill in your credentials before starting${RESET}"
fi

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
