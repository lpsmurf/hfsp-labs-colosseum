#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${OOBE_BOUNTY_URL:-http://localhost:8788}"

echo "== OOBE bounty backend health =="
curl -fsS "$BASE_URL/health"
echo
echo

echo "== SAP agent status =="
curl -fsS "$BASE_URL/api/agents/status"
echo
echo

echo "== Proof snapshot =="
curl -fsS "$BASE_URL/api/proof"
echo

