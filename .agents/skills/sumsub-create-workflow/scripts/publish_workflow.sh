#!/usr/bin/env bash
# Promote a workflow revision to a target status.
#
# Authenticates via App Token + secret (HMAC-SHA256) per
# https://docs.sumsub.com/reference/authentication.
#
# Usage:
#   SUMSUB_APP_TOKEN=sbx:...  \
#   SUMSUB_SECRET_KEY=...     \
#   ./publish_workflow.sh <workflow-id> [draft|published|archived]
#
# Default status is `published`. Drafts ship in `draft` so this script is the
# explicit "go live" step. Pass `archived` to retire a previously-published
# revision; pass `draft` to revert an over-eager publish (admins only).
#
# Refuses non-sandbox tokens unless SUMSUB_ALLOW_PROD=1.
# Override SUMSUB_BASE only for testing; default is https://api.sumsub.com.
#
# Prints the response body followed by a final line: HTTP <code>
set -euo pipefail

: "${SUMSUB_APP_TOKEN:?SUMSUB_APP_TOKEN is required (sandbox App Token, 'sbx:' prefix)}"
: "${SUMSUB_SECRET_KEY:?SUMSUB_SECRET_KEY is required (paired secret key)}"
BASE="${SUMSUB_BASE:-https://api.sumsub.com}"

if [[ "${SUMSUB_APP_TOKEN}" != sbx:* && "${SUMSUB_ALLOW_PROD:-0}" != "1" ]]; then
  echo "error: SUMSUB_APP_TOKEN does not look like a sandbox token (expected 'sbx:' prefix)." >&2
  echo "       Production credentials must not be shared with this skill." >&2
  exit 3
fi

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <workflow-id> [draft|published|archived]" >&2
  exit 2
fi

WORKFLOW_ID="$1"
STATUS="${2:-published}"
case "${STATUS}" in
  draft|published|archived) ;;
  *)
    echo "error: status must be one of: draft, published, archived (got '${STATUS}')" >&2
    exit 2
    ;;
esac

METHOD="PUT"
PATH_Q="/resources/api/applicantWorkflows/${WORKFLOW_ID}/revisionStatus"
TS="$(date -u +%s)"
BODY="$(printf '{"revisionStatus":"%s"}' "${STATUS}")"

SIG="$(
  printf '%s%s%s%s' "${TS}" "${METHOD}" "${PATH_Q}" "${BODY}" \
    | openssl dgst -sha256 -hmac "${SUMSUB_SECRET_KEY}" -hex \
    | awk '{print $NF}'
)"

curl -sS -X "${METHOD}" \
  -H "X-App-Token: ${SUMSUB_APP_TOKEN}" \
  -H "X-App-Access-Ts: ${TS}" \
  -H "X-App-Access-Sig: ${SIG}" \
  -H "X-Agent-Source: sumsub-skills" \
  -H "X-Agent-Source-Ver: 1.0.1" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  --data-binary "${BODY}" \
  -w '\nHTTP %{http_code}\n' \
  "${BASE%/}${PATH_Q}"
