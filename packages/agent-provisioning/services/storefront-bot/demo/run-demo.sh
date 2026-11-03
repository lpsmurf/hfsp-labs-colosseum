#!/usr/bin/env bash
# End-to-end demo: sign up → pay on devnet → verify → provision agent.
# Runs the storefront bot locally with demo provisioning (local dir + port stub
# instead of SSH/Docker).
set -euo pipefail
cd "$(cd "$(dirname "$0")" && pwd)/.."   # storefront-bot/

DEMO_DIR="${DEMO_DIR:-$PWD/.demo}"
mkdir -p "$DEMO_DIR/tenants"

# A stable platform wallet the server verifies payments against. Override with
# your own; the demo airdrops + creates token accounts as needed.
export SOLANA_WALLET_ADDRESS="${SOLANA_WALLET_ADDRESS:-9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM}"

# Default to a local test validator — devnet's RPC faucet is closed and the web
# faucet is rate-limited. Point SOLANA_RPC_URL at devnet + provide
# DEMO_PAYER_SECRET to run against real devnet instead.
if [[ -z "${SOLANA_RPC_URL:-}" ]]; then
  VALIDATOR_BIN="${SOLANA_TEST_VALIDATOR:-$HOME/.local/share/solana/install/active_release/bin/solana-test-validator}"
  command -v solana-test-validator >/dev/null 2>&1 && VALIDATOR_BIN=solana-test-validator
  # 8899 is a common Jupyter port — pick one that's actually free.
  RPC_PORT="${DEMO_RPC_PORT:-18899}"
  if command -v "$VALIDATOR_BIN" >/dev/null 2>&1 || [[ -x "$VALIDATOR_BIN" ]]; then
    echo "── Starting solana-test-validator on :${RPC_PORT}…"
    "$VALIDATOR_BIN" --ledger "$PWD/.demo/ledger" --reset --quiet \
      --rpc-port "$RPC_PORT" --faucet-port "$((RPC_PORT + 2))" >/dev/null 2>&1 &
    VALIDATOR_PID=$!
    trap 'kill $VALIDATOR_PID 2>/dev/null || true; kill ${SERVER_PID:-0} 2>/dev/null || true' EXIT
    READY=
    for _ in $(seq 1 60); do
      curl -sf -m 2 "http://127.0.0.1:$RPC_PORT" -X POST -H 'content-type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q '"ok"' && { READY=1; break; }
      sleep 1
    done
    [[ -n "$READY" ]] || { echo "!! validator did not become ready in 60s"; exit 1; }
    export SOLANA_RPC_URL="http://127.0.0.1:${RPC_PORT}"
  else
    export SOLANA_RPC_URL="https://api.devnet.solana.com"
    echo "!! solana-test-validator not found; using devnet (funding must be manual)"
  fi
fi

# Step 1 — create the demo mint first (server must verify against it)
echo "── Creating demo mint on ${SOLANA_RPC_URL}…"
MINT=$(npx ts-node "$PWD/demo/create-mint.ts" "$SOLANA_WALLET_ADDRESS")
export SOLANA_USDC_MINT="$MINT"
echo "   SOLANA_USDC_MINT=$SOLANA_USDC_MINT"

# Step 2 — start the server with demo provisioning
export HFSP_DB_SECRET="${HFSP_DB_SECRET:-demo-secret-min-16-chars!}"
export DB_PATH="${DB_PATH:-$DEMO_DIR/demo.sqlite}"
mkdir -p "$DEMO_DIR/secrets"
echo "1234567890:DEMO-BOT-TOKEN" > "$DEMO_DIR/secrets/bot.token"
export TELEGRAM_BOT_TOKEN_FILE="$DEMO_DIR/secrets/bot.token"
export HFSP_DEMO_PROVISION_DIR="$DEMO_DIR/tenants"
export PORT="${PORT:-3999}"
export DEMO_API_URL="http://127.0.0.1:${PORT}"

echo "── Starting storefront-bot (demo provisioning → $DEMO_DIR/tenants)…"
npx ts-node "$PWD/src/index.ts" &
SERVER_PID=$!
for _ in $(seq 1 30); do
  curl -sf -m 2 "$DEMO_API_URL/health" >/dev/null 2>&1 && break
  sleep 1
done

# Step 3 — run the payment → agent demo against it
DEMO_USDC_MINT="$SOLANA_USDC_MINT" npx ts-node "$PWD/demo/payment-to-agent.ts"

echo
echo "── Evidence: tenant secrets on 'VPS' (demo dir) ──"
ls -la "$DEMO_DIR/tenants"/*/secrets/ 2>/dev/null || true
echo "── Evidence: nothing plaintext in sqlite ──"
node -e "
const D=require('better-sqlite3')('$DB_PATH');
for (const r of D.prepare('SELECT tenant_id, status, gateway_token FROM tenants').all())
  console.log(' tenant', r.tenant_id, 'status='+r.status, 'gateway_token='+(r.gateway_token||'').slice(0,24)+'…');
console.log(' crypto_payments:', JSON.stringify(D.prepare('SELECT payment_id,status FROM crypto_payments').all()));
const w=D.prepare('SELECT data_json FROM wizard_state LIMIT 1').get();
if (w) console.log(' wizard_state.data_json =', w.data_json);
"
