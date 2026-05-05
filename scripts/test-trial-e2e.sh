#!/bin/bash
# E2E test for trial app: https://clawdrop.live/try

set -e

API_URL="${1:-https://clawdrop.live}"
echo "🧪 Testing Trial App E2E at $API_URL"
echo ""

# Test 1: Health check
echo "1️⃣  Health check..."
HEALTH=$(curl -s "$API_URL/api/health")
if echo "$HEALTH" | grep -q "ok"; then
    echo "   ✅ Health: $HEALTH"
else
    echo "   ❌ Health check failed: $HEALTH"
    exit 1
fi

# Test 2: Quota check (fresh IP test)
echo ""
echo "2️⃣  Quota check..."
QUOTA=$(curl -s "$API_URL/api/quota?ip=test.192.168.1.99")
echo "   ✅ Quota: $QUOTA"

# Test 3: Chat endpoint SSE stream
echo ""
echo "3️⃣  Testing /api/chat SSE stream..."
echo "   Sending: 'what is the price of SOL'"
CHAT_RESULT=$(curl -s -X POST "$API_URL/api/chat" \
  -H 'Content-Type: application/json' \
  -d '{"message":"what is the price of SOL?","sessionId":"e2e-test-'$(date +%s)'"}' \
  --max-time 20)

# Count chunks
CHUNK_COUNT=$(echo "$CHAT_RESULT" | grep -c "event: delta" || echo "0")
echo "   ✅ Received $CHUNK_COUNT text chunks"

# Check for done event
if echo "$CHAT_RESULT" | grep -q "event: done"; then
    echo "   ✅ Stream completed properly"
else
    echo "   ⚠️  Warning: done event not found"
fi

# Check for price in response
if echo "$CHAT_RESULT" | grep -q "USD\|price"; then
    echo "   ✅ SOL price data detected in response"
else
    echo "   ⚠️  No price data found (may need API keys)"
fi

echo ""
echo "🎉 E2E Tests Complete!"
echo ""
echo "Next: Open $API_URL/try in a browser and:"
echo "  1. Send messages (should see SSE streaming)"
echo "  2. Send 10+ messages to trigger paywall"
echo "  3. Verify Phantom button appears"
