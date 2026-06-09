#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Clawdrop VPN/VPS — Solana USDC payment demo
#
# Records with asciinema (run from packages/x402-vpn-vps/):
#   DEMO_WALLET_KEY='<b64-keypair>' asciinema rec demo.cast --command ./demo.sh \
#     --title "Clawdrop VPN/VPS — Solana USDC Demo"
#
# Requires:
#   DEMO_WALLET_KEY  base64-encoded 64-byte Solana keypair (oobe-bounty wallet)
#   HELIUS_RPC_URL   (optional) Helius mainnet RPC for on-chain confirmation
# ─────────────────────────────────────────────────────────────────────────────
export TERM="${TERM:-xterm-256color}"
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$DIR/backend"

R='\033[0m'
B='\033[1m'
DIM='\033[2m'
GRN='\033[32m'
YLW='\033[33m'
CYN='\033[36m'
MGT='\033[35m'
RED='\033[31m'

cmd()    { echo -e "  ${YLW}\$${R} $*"; sleep 0.4; }
ok_msg() { echo -e "  ${GRN}✓${R}  $*"; }
info()   { echo -e "  ${DIM}$*${R}"; }

clear

echo -e "${B}${MGT}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║   Clawdrop — Anonymous VPN/VPS via x402 + Solana    ║"
echo "  ║   vpn.hfsp.cloud  |  USDC  |  x402 v2 protocol     ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${R}"
sleep 1

# ── Preflight ──────────────────────────────────────────────────────────────
echo -e "${B}${CYN}[ Preflight checks ]${R}"

if [[ -z "${DEMO_WALLET_KEY:-}" ]]; then
  echo -e "${RED}✗  DEMO_WALLET_KEY not set. Load your wallet env first.${R}"
  exit 1
fi

cmd "curl -sf https://vpn.hfsp.cloud/health"
HEALTH=$(curl -sf https://vpn.hfsp.cloud/health 2>/dev/null || echo '{"ok":false}')
if echo "$HEALTH" | grep -q '"ok":true'; then
  ok_msg "vpn.hfsp.cloud is live"
else
  echo -e "${RED}✗  Health check failed: $HEALTH${R}"
  exit 1
fi

echo ""
echo -e "${B}${CYN}[ x402 gate check ]${R}"
cmd "curl -sI -X POST https://vpn.hfsp.cloud/api/vpn/test | head -3"
STATUS=$(curl -sI -X POST https://vpn.hfsp.cloud/api/vpn/test 2>/dev/null | head -1)
echo -e "  ${DIM}${STATUS}${R}"
if echo "$STATUS" | grep -q "402"; then
  ok_msg "402 Payment Required — x402 gate active on Solana mainnet"
else
  echo -e "${RED}✗  Expected 402, got: $STATUS${R}"
  exit 1
fi

sleep 1

# ── Payment demo ───────────────────────────────────────────────────────────
echo ""
echo -e "${B}${CYN}[ Provisioning VPN + VPS via Solana USDC ]${R}"
echo -e "  ${DIM}oobe-bounty agent wallet → vpn.hfsp.cloud${R}"
echo -e "  ${DIM}VPN/hour: \$0.20 USDC  |  VPS/hour: \$0.25 USDC${R}"
echo ""

cmd "npx tsx backend/src/demo.ts"
echo ""

cd "$BACKEND"
DEMO_WALLET_KEY="${DEMO_WALLET_KEY}" \
  HELIUS_RPC_URL="${HELIUS_RPC_URL:-https://api.mainnet-beta.solana.com}" \
  VPN_API_URL="https://vpn.hfsp.cloud" \
  npx tsx src/demo.ts
