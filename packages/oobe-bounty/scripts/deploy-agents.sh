#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${OOBE_BOUNTY_URL:-http://localhost:8788}"

echo "Registering all OOBE bounty agents against $BASE_URL"
curl -fsS \
  -X POST "$BASE_URL/api/agents/register" \
  -H "Content-Type: application/json" \
  -d '{}'
echo
echo

echo "Current agent status"
curl -fsS "$BASE_URL/api/agents/status"
echo

