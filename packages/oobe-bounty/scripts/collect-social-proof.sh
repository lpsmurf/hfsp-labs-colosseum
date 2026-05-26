#!/usr/bin/env bash
set -euo pipefail

echo "📊 Clawdrop Social Proof Collector"
echo "==================================="
echo ""

DB="${DATABASE_PATH:-./data/bounty-vault.db}"

# Database verification
echo "🗄️  Database Verification"
echo "-------------------------"
sqlite3 "$DB" "SELECT COUNT(*) as total_signals, SUM(CASE WHEN posted_to_twitter THEN 1 ELSE 0 END) as on_twitter, SUM(CASE WHEN posted_to_telegram THEN 1 ELSE 0 END) as on_telegram FROM trading_signals;" || echo "DB query failed"
echo ""

# Twitter metrics via API (if credentials available)
echo "🐦 Twitter Metrics"
echo "------------------"
if [ -n "${TWITTER_BEARER_TOKEN:-}" ]; then
  curl -s -H "Authorization: Bearer $TWITTER_BEARER_TOKEN" \
    "https://api.twitter.com/2/tweets/search/recent?query=from:ClawdropSignals&max_results=100" | \
    jq -r '{tweet_count: .meta.result_count, newest_id: .meta.newest_id}' 2>/dev/null || echo "Twitter API query failed"
else
  echo "TWITTER_BEARER_TOKEN not set — skipping API query"
fi
echo ""

# Telegram metrics via API (if credentials available)
echo "📱 Telegram Metrics"
echo "-------------------"
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHANNEL_ID:-}" ]; then
  curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat?chat_id=${TELEGRAM_CHANNEL_ID}" | \
    jq -r '{title: .result.title, member_count: .result.member_count, type: .result.type}' 2>/dev/null || echo "Telegram API query failed"
else
  echo "TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID not set — skipping API query"
fi
echo ""

echo "✅ Done. Copy output above into docs/SOCIAL-PROOF.md"
