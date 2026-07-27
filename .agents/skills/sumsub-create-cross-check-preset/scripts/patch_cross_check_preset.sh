#!/usr/bin/env bash
# PATCH an existing cross-check preset by id via the Sumsub API.
#
# The payload must include the preset `id`. The server identifies the row
# by `id` and applies the rest of the body.
#
# Authenticates via App Token + secret (HMAC-SHA256) per
# https://docs.sumsub.com/reference/authentication.
#
# Usage:
#   SUMSUB_APP_TOKEN=sbx:...  \
#   SUMSUB_SECRET_KEY=...     \
#   ./patch_cross_check_preset.sh /path/to/preset-with-id.json
#
# Refuses non-sandbox tokens unless SUMSUB_ALLOW_PROD=1.
#
# Prints the response body followed by a final line: HTTP <code>
set -euo pipefail

: "${SUMSUB_APP_TOKEN:?SUMSUB_APP_TOKEN is required (sandbox App Token, 'sbx:' prefix)}"
: "${SUMSUB_SECRET_KEY:?SUMSUB_SECRET_KEY is required (paired secret key)}"

if [[ "${SUMSUB_APP_TOKEN}" != sbx:* && "${SUMSUB_ALLOW_PROD:-0}" != "1" ]]; then
  echo "error: SUMSUB_APP_TOKEN does not look like a sandbox token (expected 'sbx:' prefix)." >&2
  echo "       Production credentials must not be shared with this skill." >&2
  exit 3
fi

# Payload comes from $1 (file path), stdin if no arg, or "-" for explicit stdin.
PAYLOAD="${1:--}"
if [[ "${PAYLOAD}" == "-" ]]; then
  PAYLOAD="$(mktemp)"
  trap 'rm -f "${PAYLOAD}"' EXIT
  cat > "${PAYLOAD}"
elif [[ ! -f "${PAYLOAD}" ]]; then
  echo "payload file not found: ${PAYLOAD}" >&2
  exit 2
fi
if [[ ! -s "${PAYLOAD}" ]]; then
  echo "error: payload is empty (no file content, or stdin closed without data)" >&2
  exit 2
fi

if ! python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if "id" in d else 1)' "${PAYLOAD}"; then
  echo "error: payload is missing required \"id\" field for PATCH" >&2
  exit 2
fi

METHOD="PATCH"
PATH_Q="/resources/api/crossCheckPresets"

# Use secure Python helper to compute signature and perform request (no secrets on argv)
python3 "$(dirname "$0")/sumsub_request.py" "${METHOD}" "${PATH_Q}" "${PAYLOAD}"
