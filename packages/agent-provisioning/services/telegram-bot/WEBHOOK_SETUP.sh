#!/bin/bash
# Quick webhook registration for hfsp_minibot
# Usage: ./WEBHOOK_SETUP.sh <domain.com> [secret_token]

set -e

DOMAIN="${1:-yourdomain.com}"
SECRET="${2:-$(openssl rand -hex 32)}"

# Token file location (production)
TOKEN_FILE="/home/clawd/.openclaw/secrets/hfsp_agent_bot.token"

# Check if token file exists
if [ ! -f "$TOKEN_FILE" ]; then
  echo "❌ Token file not found: $TOKEN_FILE"
  echo "Make sure this script runs on the production server."
  exit 1
fi

# Load token
TOKEN=$(cat "$TOKEN_FILE")

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to read token from $TOKEN_FILE"
  exit 1
fi

echo "🤖 Registering webhook for hfsp_minibot"
echo "   Domain: https://${DOMAIN}/telegram/webhook"
echo "   Secret: ${SECRET:0:16}..."
echo ""

# Register webhook
RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"https://${DOMAIN}/telegram/webhook\",
    \"secret_token\": \"${SECRET}\",
    \"allowed_updates\": [\"message\", \"callback_query\"]
  }")

echo "Response: $RESPONSE"

# Check if successful
if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo ""
  echo "✅ Webhook registered successfully!"
  echo ""
  echo "Save this secret in your .env file:"
  echo "TELEGRAM_SECRET_TOKEN=${SECRET}"
  echo ""
  echo "Verify webhook:"
  echo "curl \"https://api.telegram.org/bot${TOKEN}/getWebhookInfo\""
  exit 0
else
  echo ""
  echo "❌ Failed to register webhook. Check the response above."
  exit 1
fi
