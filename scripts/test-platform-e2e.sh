#!/usr/bin/env bash
# Openclaw Platform E2E Test
# Tests: health, auth, payments quote, subscription flow, agent deploy
# Usage: bash scripts/test-platform-e2e.sh [BASE_URL]

set -euo pipefail

BASE_URL="${1:-http://localhost:8788}"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

function log() { echo -e "${YELLOW}[TEST]${NC} $1"; }
function ok()  { echo -e "${GREEN}✓${NC} $1"; ((PASS++)) || true; }
function err() { echo -e "${RED}✗${NC} $1"; ((FAIL++)) || true; }

function json_val() {
  python3 -c "import sys,json; print(json.load(sys.stdin).get('$1',''))" 2>/dev/null || echo ""
}

log "Testing Openclaw Platform at $BASE_URL"
echo ""

# ── 1. Health Check ──────────────────────────────────────────────────────────
log "1. Health check"
HEALTH=$(curl -s --max-time 10 "$BASE_URL/api/health" || true)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  ok "Health check passed"
else
  err "Health check failed: $HEALTH"
fi

# ── 2. Payment Quote ─────────────────────────────────────────────────────────
log "2. Payment quote"
QUOTE=$(curl -s --max-time 15 "$BASE_URL/api/payments/quote?tier=starter" || true)
if echo "$QUOTE" | grep -q '"tier":"starter"'; then
  ok "Payment quote returned"
else
  err "Payment quote failed: $QUOTE"
fi

# ── 3. Auth (Login with wallet) ──────────────────────────────────────────────
log "3. Auth login"
TEST_WALLET="11111111111111111111111111111111"
AUTH=$(curl -s --max-time 10 -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"wallet_address\":\"$TEST_WALLET\"}" || true)

TOKEN=$(echo "$AUTH" | json_val token)
if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  ok "Auth login passed, got token"
else
  err "Auth login failed: $AUTH"
  TOKEN=""
fi

# ── 4. Get Subscription (should be 404 for new user) ─────────────────────────
log "4. Get subscription (new user = 404)"
if [ -n "$TOKEN" ]; then
  SUB=$(curl -s --max-time 10 -w "%{http_code}" -o /tmp/sub.json \
    "$BASE_URL/api/subscriptions" \
    -H "Authorization: Bearer $TOKEN" || true)
  if [ "$SUB" = "404" ]; then
    ok "Subscription correctly 404 for new user"
  else
    err "Unexpected subscription response: $SUB $(cat /tmp/sub.json 2>/dev/null || echo 'empty')"
  fi
else
  log "  Skipped (no auth token)"
fi

# ── 5. Deploy Agent (should fail without subscription) ───────────────────────
log "5. Deploy agent without subscription (should 403)"
if [ -n "$TOKEN" ]; then
  DEPLOY=$(curl -s --max-time 10 -w "%{http_code}" -o /tmp/deploy.json -X POST \
    "$BASE_URL/api/agents/deploy" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"test-agent","llm_provider":"poly"}' || true)
  if [ "$DEPLOY" = "403" ]; then
    ok "Deploy correctly rejected without subscription"
  else
    err "Unexpected deploy response: $DEPLOY $(cat /tmp/deploy.json 2>/dev/null || echo 'empty')"
  fi
else
  log "  Skipped (no auth token)"
fi

# ── 6. Token Usage (should be empty for new user) ────────────────────────────
log "6. Token usage"
if [ -n "$TOKEN" ]; then
  USAGE=$(curl -s --max-time 10 "$BASE_URL/api/usage/tokens" \
    -H "Authorization: Bearer $TOKEN" || true)
  if echo "$USAGE" | grep -q '"month"'; then
    ok "Token usage endpoint returned"
  else
    err "Token usage failed: $USAGE"
  fi
else
  log "  Skipped (no auth token)"
fi

# ── 7. List Agents (empty for new user) ──────────────────────────────────────
log "7. List agents"
if [ -n "$TOKEN" ]; then
  AGENTS=$(curl -s --max-time 10 "$BASE_URL/api/agents" \
    -H "Authorization: Bearer $TOKEN" || true)
  if echo "$AGENTS" | grep -q '"agents"'; then
    ok "List agents endpoint returned"
  else
    err "List agents failed: $AGENTS"
  fi
else
  log "  Skipped (no auth token)"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
log "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi

echo -e "${GREEN}All tests passed ✓${NC}"
