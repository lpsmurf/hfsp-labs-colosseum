#!/usr/bin/env bash
# PATCH an existing POA preset by id via the Sumsub API.
#
# The payload must include the preset `id` (the server identifies the row
# by `id`, then applies the rest of the body as the updated state).
#
# Authenticates via App Token + secret (HMAC-SHA256) per
# https://docs.sumsub.com/reference/authentication.
#
# Usage:
#   SUMSUB_APP_TOKEN=sbx:...  \
#   SUMSUB_SECRET_KEY=...     \
#   ./patch_poa_preset.sh /path/to/preset-with-id.json
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
PATH_Q="/resources/api/poaStepSettings"

# Use secure Python helper to compute signature and perform request (no secrets on argv).
# The Python helper includes X-Agent-Source and X-Agent-Source-Ver headers by default.
#
# CROSS-SKILL DEPENDENCY: this script reuses sumsub_request.py from the
# sumsub-create-cross-check-preset skill (3-arg interface: METHOD PATH PAYLOAD).
# The location is overridable via SUMSUB_REQUEST_HELPER so a directory move
# doesn't break it; the default points at the sibling skill's copy.
SUMSUB_REQUEST_HELPER="${SUMSUB_REQUEST_HELPER:-$(dirname "$0")/../../sumsub-create-cross-check-preset/scripts/sumsub_request.py}"
if [[ ! -f "${SUMSUB_REQUEST_HELPER}" ]]; then
  echo "error: sumsub_request.py helper not found at ${SUMSUB_REQUEST_HELPER}." >&2
  echo "       Set SUMSUB_REQUEST_HELPER to its absolute path." >&2
  exit 2
fi
python3 "${SUMSUB_REQUEST_HELPER}" "${METHOD}" "${PATH_Q}" "${PAYLOAD}"
