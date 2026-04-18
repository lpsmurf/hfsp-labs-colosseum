#!/bin/bash
set -euo pipefail

API_URL="http://localhost:3001"
TEST_TOKEN="test-dev-key-12345"
TENANT_VPS="root@187.124.173.69"
SSH_KEY="/home/clawd/.ssh/id_ed25519_hfsp_provisioner"

echo "=============================================="
echo "HFSP Service Verification - Port 3001"
echo "=============================================="
echo ""
echo "Testing: telegram_token and llm_api_key in deploy requests"
echo ""

# Test 1: Service running on port 3001
echo "[TEST 1] Service Running on Port 3001"
echo "  Checking http://localhost:3001/health ..."
HEALTH=$(curl -s "${API_URL}/health" 2>/dev/null || echo "{}")
if echo "$HEALTH" | grep -q '"ok":true'; then
    echo "  ✓ PASS: HFSP API is running on port 3001"
else
    echo "  ✗ FAIL: Health check failed"
    exit 1
fi
echo ""

# Test 2: Deploy endpoint accepts telegram_token and llm_api_key
echo "[TEST 2] Deploy Endpoint Accepts Required Parameters"
echo "  Sending POST /api/v1/agents/deploy ..."

DEPLOY_RESPONSE=$(curl -s -X POST "${API_URL}/api/v1/agents/deploy" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TEST_TOKEN}" \
    -d '{
        "deployment_id": "verify_'$(date +%s)'",
        "tier_id": "kvm-4-anthropic",
        "region": "default",
        "capability_bundle": "telegram+agent",
        "payment_verified": true,
        "wallet_address": "TEST_WALLET_'$(date +%s)'",
        "telegram_token": "123456789:TEST_TELEGRAM_TOKEN_'$(date +%s)'",
        "llm_provider": "anthropic",
        "llm_api_key": "sk-ant-api03-verify-'$(date +%s)'-testkey12345"
    }' 2>&1)

AGENT_ID=$(echo "$DEPLOY_RESPONSE" | grep -oP '"agent_id":\s*"[^"]+"' | cut -d'"' -f4 || echo "")

if [ -n "$AGENT_ID" ]; then
    echo "  ✓ PASS: Deploy request accepted"
    echo "  Agent ID: $AGENT_ID"
else
    echo "  ✗ FAIL: Deploy request failed"
    echo "  Response: $DEPLOY_RESPONSE"
    exit 1
fi
echo ""

# Test 3: Container created with correct env vars
echo "[TEST 3] Environment Variables Reach Container"
echo "  Waiting for container startup (5s)..."
sleep 5

CONTAINER_NAME="hfsp_${AGENT_ID}"
echo "  Checking container: $CONTAINER_NAME"

ENV_OUTPUT=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$TENANT_VPS" \
    "docker exec ${CONTAINER_NAME} env 2>/dev/null | grep -E 'TELEGRAM|LLM|ANTHROPIC' | sort" 2>&1 || echo "")

if [ -z "$ENV_OUTPUT" ]; then
    echo "  Waiting additional 5s for container..."
    sleep 5
    ENV_OUTPUT=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$TENANT_VPS" \
        "docker exec ${CONTAINER_NAME} env 2>/dev/null | grep -E 'TELEGRAM|LLM|ANTHROPIC' | sort" 2>&1 || echo "")
fi

echo "  Container env vars:"
echo "$ENV_OUTPUT" | sed 's/^/    /'

TELEGRAM_SET=false
LLM_API_KEY_SET=false

if echo "$ENV_OUTPUT" | grep -q "TELEGRAM_BOT_TOKEN="; then
    TELEGRAM_SET=true
    echo "  ✓ telegram_token → TELEGRAM_BOT_TOKEN: SET"
else
    echo "  ✗ telegram_token → TELEGRAM_BOT_TOKEN: NOT SET"
fi

if echo "$ENV_OUTPUT" | grep -q "ANTHROPIC_API_KEY="; then
    LLM_API_KEY_SET=true
    echo "  ✓ llm_api_key → ANTHROPIC_API_KEY: SET"
else
    echo "  ✗ llm_api_key → ANTHROPIC_API_KEY: NOT SET"
fi

if [ "$TELEGRAM_SET" = true ] && [ "$LLM_API_KEY_SET" = true ]; then
    echo "  ✓ PASS: Both env vars reach container correctly"
else
    echo "  ✗ FAIL: Some env vars missing in container"
    exit 1
fi
echo ""

# Test 4: LLM_PROVIDER is set
echo "[TEST 4] LLM Provider Configuration"
if echo "$ENV_OUTPUT" | grep -q "LLM_PROVIDER=anthropic"; then
    echo "  ✓ PASS: LLM_PROVIDER=anthropic is set"
else
    echo "  ✗ FAIL: LLM_PROVIDER not set correctly"
    exit 1
fi
echo ""

echo "=============================================="
echo "ALL TESTS PASSED"
echo "=============================================="
echo ""
echo "Summary:"
echo "  ✓ HFSP service running on port 3001"
echo "  ✓ /api/v1/agents/deploy accepts telegram_token"
echo "  ✓ /api/v1/agents/deploy accepts llm_api_key"
echo "  ✓ TELEGRAM_BOT_TOKEN reaches container"
echo "  ✓ ANTHROPIC_API_KEY reaches container"
echo "  ✓ LLM_PROVIDER reaches container"
echo ""
echo "Container: $CONTAINER_NAME"
echo "Verified at: $(date -Iseconds)"
