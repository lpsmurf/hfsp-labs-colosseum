#!/usr/bin/env bash
# Fetches tenant background-check entitlements from
# GET /resources/api/agent/settings/bgCheckTargets
# and returns JSON with `allowed` (array of permission keys) and
# `descriptions` (map of key → human-readable description).
#
# Usage:
#   SUMSUB_APP_TOKEN=sbx:...  SUMSUB_SECRET_KEY=...  bash check_permissions.sh
set -euo pipefail

: "${SUMSUB_APP_TOKEN:?SUMSUB_APP_TOKEN is required (sandbox App Token, 'sbx:' prefix)}"
: "${SUMSUB_SECRET_KEY:?SUMSUB_SECRET_KEY is required (paired secret key)}"
BASE="${SUMSUB_BASE:-https://api.sumsub.com}"

if [[ "${SUMSUB_APP_TOKEN}" != sbx:* && "${SUMSUB_ALLOW_PROD:-0}" != "1" ]]; then
  echo "error: SUMSUB_APP_TOKEN does not look like a sandbox token (expected 'sbx:' prefix)." >&2
  echo "       Production credentials must not be shared with this skill." >&2
  exit 3
fi

METHOD="GET"
PATH_Q="/resources/api/agent/settings/bgCheckTargets"
TS="$(date -u +%s)"

SIG="$(
  printf '%s%s%s' "${TS}" "${METHOD}" "${PATH_Q}" \
    | openssl dgst -sha256 -hmac "${SUMSUB_SECRET_KEY}" -hex \
    | awk '{print $NF}'
)"

curl -sS -X "${METHOD}" \
  --connect-timeout 10 --max-time 60 \
  -H "X-App-Token: ${SUMSUB_APP_TOKEN}" \
  -H "X-App-Access-Ts: ${TS}" \
  -H "X-App-Access-Sig: ${SIG}" \
  -H "Accept: application/json" \
  -H "X-Agent-Source: sumsub-skills" \
  -H "X-Agent-Source-Ver: 1.0.1" \
  -w '\nHTTP %{http_code}\n' \
  "${BASE%/}${PATH_Q}"
