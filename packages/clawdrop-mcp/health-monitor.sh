#!/bin/bash
# Health monitoring script - sends alerts to Telegram on failures
# Run every 5 minutes via cron: */5 * * * * /path/to/health-monitor.sh

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-test_token_for_dev}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-0}"  # Set your chat ID
HEALTH_URL="http://localhost:3000/health"
STATUS_FILE="/tmp/hfsp-health-status"

# Timeout after 3 seconds
RESPONSE=$(timeout 3 curl -s -w "\n%{http_code}" "$HEALTH_URL" 2>/dev/null)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

# Check if healthy
if [ "$HTTP_CODE" = "200" ]; then
  STATUS="healthy"
else
  STATUS="unhealthy"
fi

# Get previous status
PREV_STATUS=$(cat "$STATUS_FILE" 2>/dev/null)

# Send alert if status changed
if [ "$STATUS" != "$PREV_STATUS" ]; then
  if [ "$STATUS" = "unhealthy" ]; then
    MESSAGE="🚨 HFSP Service DOWN (HTTP $HTTP_CODE)"
    curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
      -d "chat_id=$TELEGRAM_CHAT_ID&text=$MESSAGE" > /dev/null
  else
    MESSAGE="✅ HFSP Service recovered"
    curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
      -d "chat_id=$TELEGRAM_CHAT_ID&text=$MESSAGE" > /dev/null
  fi
fi

# Save status
echo "$STATUS" > "$STATUS_FILE"
