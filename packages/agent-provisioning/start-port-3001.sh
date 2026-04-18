#!/bin/bash
set -euo pipefail

cd /home/clawd/.openclaw/workspace/hfsp-agent-provisioning

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build TypeScript if needed
if [ ! -d "dist" ] || [ "services/storefront-bot/src/index.ts" -nt "dist/services/storefront-bot/src/index.js" ]; then
    echo "Building TypeScript..."
    npm run build
fi

# Set environment for port 3001
export PORT=3001
export NODE_ENV=development
export DB_PATH=./data/storefront-3001.sqlite
export HFSP_API_KEY=test-dev-key-12345

# Use test secrets or create minimal ones
export TELEGRAM_BOT_TOKEN_FILE=/home/clawd/.openclaw/secrets/hfsp_agent_bot.token
export HFSP_DB_SECRET_FILE=/home/clawd/.openclaw/secrets/hfsp_db_secret

# Create test secrets if they don't exist
mkdir -p /home/clawd/.openclaw/secrets
if [ ! -f "$TELEGRAM_BOT_TOKEN_FILE" ]; then
    echo "123456:TEST_TOKEN_FOR_HFSP_TESTING_$(date +%s)" > "$TELEGRAM_BOT_TOKEN_FILE"
    chmod 600 "$TELEGRAM_BOT_TOKEN_FILE"
fi
if [ ! -f "$HFSP_DB_SECRET_FILE" ]; then
    echo "hfsp-test-secret-$(date +%s)-min16chars" > "$HFSP_DB_SECRET_FILE"
    chmod 600 "$HFSP_DB_SECRET_FILE"
fi

echo "Starting HFSP API on port 3001..."
exec node dist/services/storefront-bot/src/index.js
