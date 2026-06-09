#!/usr/bin/env bash
# demo.sh — WDK Module bounty demo for @clawdrop/wdk-swap-solana
#
# Runs in three acts:
#   1. Test suite  (brittle TAP)
#   2. Live quote  (Jupiter mainnet API — no wallet needed)
#   3. Live swap   (real SOL → USDT on mainnet)
#
# Usage:
#   PRIVATE_KEY=<base58> RPC_URL=<helius-url> bash examples/demo.sh
#
# PRIVATE_KEY  — base58-encoded Solana private key
# RPC_URL      — Solana RPC (defaults to public mainnet-beta)
# AMOUNT_SOL   — SOL to swap (default: 0.001)

set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RESET='\033[0m'

header () {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}  $1${RESET}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
}

cd "$PKG_DIR"

# ── Act 1: Test suite ─────────────────────────────────────────────────────────
header "ACT 1 / 3 — Test suite (brittle)"
npm test

echo ""
echo -e "${GREEN}✓ All tests passed${RESET}"
sleep 1

# ── Act 2: Live quote ─────────────────────────────────────────────────────────
header "ACT 2 / 3 — Live quote (Jupiter mainnet, no wallet needed)"
node examples/quote.js

sleep 1

# ── Act 3: Live swap ──────────────────────────────────────────────────────────
header "ACT 3 / 3 — Live swap (SOL → USDT on Solana mainnet)"

if [ -z "${PRIVATE_KEY:-}" ]; then
  echo "  PRIVATE_KEY not set — skipping live swap"
  echo "  To run: PRIVATE_KEY=<base58> RPC_URL=<url> bash examples/demo.sh"
else
  node examples/swap.js
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  @clawdrop/wdk-swap-solana — demo complete${RESET}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
