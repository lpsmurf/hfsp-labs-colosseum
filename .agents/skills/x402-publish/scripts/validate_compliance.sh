#!/usr/bin/env bash
# validate_compliance.sh <base-url>
#
# Probes a live x402 service and validates it meets x402scan's
# discovery requirements (draft-payment-discovery-00).
#
# Exit code 0 = all checks passed
# Exit code 1 = one or more checks failed
set -euo pipefail

BASE="${1:-}"
if [[ -z "$BASE" ]]; then
  echo "Usage: validate_compliance.sh <base-url>" >&2
  echo "  e.g. validate_compliance.sh https://feed.xstocks.hfsp.cloud" >&2
  exit 1
fi
BASE="${BASE%/}"

PASS=0; FAIL=0; WARN=0

# Prefix increments: ((X++)) returns status 1 when X is 0, which kills set -e.
ok()   { echo "  ✓  $*"; ((++PASS)); }
fail() { echo "  ✗  $*"; ((++FAIL)); }
warn() { echo "  ⚠  $*"; ((++WARN)); }
sep()  { echo; echo "── $* ──────────────────────────────────────"; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
DOC="$TMP/openapi.json"

# ── 1. Discovery endpoint ─────────────────────────────────────────────────────
sep "Discovery endpoint"

HTTP=$(curl -s -o "$DOC" -D "$TMP/openapi.headers" -w "%{http_code}" "$BASE/openapi.json" 2>/dev/null || echo "000")
if [[ "$HTTP" == "200" ]]; then
  ok "GET /openapi.json → HTTP 200"
else
  fail "GET /openapi.json → HTTP $HTTP (expected 200)"
fi

CT=$(grep -i "^content-type:" "$TMP/openapi.headers" 2>/dev/null | head -1 || true)
if echo "$CT" | grep -qi "application/json"; then
  ok "Content-Type: application/json"
else
  fail "Content-Type missing or wrong: $CT"
fi

CC=$(grep -i "^cache-control:" "$TMP/openapi.headers" 2>/dev/null | head -1 || true)
if echo "$CC" | grep -qi "max-age"; then
  ok "Cache-Control: max-age present"
else
  warn "Cache-Control header missing (recommended: max-age=300)"
fi

# ── 2. Parse OpenAPI doc ──────────────────────────────────────────────────────
sep "OpenAPI document structure"

if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$DOC" 2>/dev/null; then
  fail "Response is not valid JSON — aborting further checks"
  echo
  echo "Summary: $PASS passed, $FAIL failed, $WARN warnings"
  exit 1
fi

# The doc path goes in as argv so stdin stays free for the heredoc script.
# Errors are not suppressed: a crash becomes a FAIL instead of silent success.
if ! CHECKS=$(python3 - "$DOC" << 'PYEOF'
import json, sys

with open(sys.argv[1]) as f:
    doc = json.load(f)

for field in ['openapi', 'info', 'paths']:
    if field not in doc:
        print(f"TOP_ERROR:Missing top-level field: {field}")
if 'info' in doc:
    for f in ['title', 'version']:
        if f not in doc['info']:
            print(f"TOP_ERROR:Missing info.{f}")
if 'x-service-info' not in doc:
    print("TOP_WARN:Missing x-service-info (categories + docs links)")
else:
    si = doc['x-service-info']
    if not si.get('categories'):
        print("TOP_WARN:x-service-info.categories is empty")
    if 'docs' not in si:
        print("TOP_WARN:x-service-info.docs missing (homepage/apiReference)")

HTTP_METHODS = {'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'}
MISSING = object()

def example_of(obj):
    """First usable example on a parameter / media object or its schema."""
    if not isinstance(obj, dict):
        return MISSING
    for src in (obj, obj.get('schema') or {}):
        if 'example' in src:
            return src['example']
        ex = src.get('examples')
        if isinstance(ex, list) and ex:
            return ex[0]
        if isinstance(ex, dict) and ex:
            first = next(iter(ex.values()))
            return first.get('value', MISSING) if isinstance(first, dict) else first
        if 'default' in src:
            return src['default']
    return MISSING

def build_probe(path, op):
    """Concrete request for an unpaid probe, or None if a required input has no example."""
    from urllib.parse import quote, urlencode
    query = {}
    for p in op.get('parameters', []):
        if not isinstance(p, dict):
            continue
        value = example_of(p)
        where = p.get('in')
        if where == 'path':
            if value is MISSING:
                return None
            path = path.replace('{' + str(p.get('name')) + '}', quote(str(value), safe=''))
        elif where == 'query' and (p.get('required') or value is not MISSING):
            if value is MISSING:
                return None
            query[p.get('name')] = value
    if '{' in path:
        return None
    body = None
    rb = op.get('requestBody')
    if isinstance(rb, dict):
        media = (rb.get('content') or {}).get('application/json')
        value = example_of(media) if media is not None else MISSING
        if value is MISSING:
            if rb.get('required'):
                return None
        else:
            body = json.dumps(value)
    url = path + ('?' + urlencode(query) if query else '')
    return {"url": url, "body": body}
paths = doc.get('paths', {})
gated = free = 0
for path, methods in paths.items():
    for method, op in methods.items():
        if method not in HTTP_METHODS or not isinstance(op, dict):
            continue
        label = f"{method.upper()} {path}"
        if 'x-payment-info' not in op:
            free += 1
            if op.get('security') != []:
                print(f"SCHEMA_WARN:  {label}: free operation without x-payment-info must declare security: []")
            continue
        if op.get('security') == []:
            print(f"SCHEMA_WARN:  {label}: has x-payment-info but also security:[] — ambiguous")
        gated += 1
        pi = op['x-payment-info']
        offers = pi.get('offers', [pi]) if isinstance(pi, dict) else None
        if not isinstance(offers, list) or not offers or not all(isinstance(o, dict) for o in offers):
            print(f"SCHEMA_ERROR:  {label}: x-payment-info offers must be a non-empty list of objects")
            offers = []
        for offer in offers:
            for f in ['intent', 'method', 'amount', 'currency']:
                if f not in offer:
                    print(f"SCHEMA_ERROR:  {label}: x-payment-info missing '{f}'")
        if '402' not in op.get('responses', {}):
            print(f"SCHEMA_ERROR:  {label}: no 402 response declared")
        params_with_schema = [p for p in op.get('parameters', []) if 'schema' in p]
        if not params_with_schema and 'requestBody' not in op:
            print(f"SCHEMA_ERROR:  {label}: missing input schema (add parameters with schema or requestBody)")
        resp_200 = op.get('responses', {}).get('200', {})
        if not resp_200.get('content', {}).get('application/json', {}).get('schema'):
            print(f"SCHEMA_WARN:  {label}: missing output schema (add responses.200.content.application/json.schema)")
        probe = build_probe(path, op)
        if probe is None:
            print(f"UNVERIFIED:{label}: required inputs have no usable examples — 402 enforcement not probed")
        else:
            print("PROBE:" + json.dumps({"method": method.upper(), **probe}))

print(f"Paths: {len(paths)} total ({gated} gated, {free} free)")
PYEOF
); then
  fail "OpenAPI document could not be analysed (python error above)"
fi

PAID_OPS=()
while IFS= read -r line; do
  case "$line" in
    SCHEMA_ERROR:*) fail "${line#SCHEMA_ERROR:}" ;;
    SCHEMA_WARN:*)  warn "${line#SCHEMA_WARN:}" ;;
    TOP_ERROR:*)    fail "${line#TOP_ERROR:}" ;;
    TOP_WARN:*)     warn "${line#TOP_WARN:}" ;;
    PROBE:*)        PAID_OPS+=("${line#PROBE:}") ;;
    UNVERIFIED:*)   warn "${line#UNVERIFIED:}" ;;
    Paths:*)        ok "$line" ;;
  esac
done <<< "$CHECKS"

# ── 3. Live 402 probing ───────────────────────────────────────────────────────
sep "Live endpoint probing (paid operations)"

if [[ ${#PAID_OPS[@]} -eq 0 ]]; then
  warn "No gated operations could be probed (missing input examples)"
else
  for op in "${PAID_OPS[@]}"; do
    METHOD=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['method'])" "$op")
    path=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['url'])" "$op")
    BODY=$(python3 -c "import json,sys; b=json.loads(sys.argv[1])['body']; print('' if b is None else b)" "$op")
    URL="$BASE$path"
    CURL_ARGS=(-s -X "$METHOD" -o "$TMP/probe.json" -D "$TMP/probe.headers" -w "%{http_code}")
    if [[ -n "$BODY" ]]; then CURL_ARGS+=(-H "Content-Type: application/json" --data "$BODY"); fi
    HTTP=$(curl "${CURL_ARGS[@]}" "$URL" 2>/dev/null || echo "000")
    if [[ "$HTTP" == "402" ]]; then
      ok "$METHOD $path → HTTP 402"
      HDR=$(grep -i "^payment-required:" "$TMP/probe.headers" | head -1 || true)
      if [[ -n "$HDR" ]]; then
        ok "  payment-required header present"
        B64=$(echo "$HDR" | sed 's/^payment-required:[[:space:]]*//i' | tr -d '[:space:]')
        if [[ -n "$B64" ]]; then
          VERSION=$(echo "$B64" | base64 -d 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('x402Version','?'))" 2>/dev/null || echo "?")
          if [[ "$VERSION" == "2" ]]; then
            ok "  x402Version: 2 ✓"
          else
            fail "  x402Version: $VERSION (expected 2)"
          fi
        fi
      else
        fail "  payment-required header missing from 402 response"
      fi
      if python3 -c "import json,sys; d=json.load(open(sys.argv[1])); assert 'accepts' in d" "$TMP/probe.json" 2>/dev/null; then
        ok "  402 body has 'accepts' array"
      else
        warn "  402 body may be missing 'accepts' array"
      fi
    else
      fail "$METHOD $path → HTTP $HTTP (expected 402)"
    fi
  done
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo
echo "══════════════════════════════════════════════════════"
echo "  Result: $PASS passed   $FAIL failed   $WARN warnings"
echo "══════════════════════════════════════════════════════"

if [[ $FAIL -gt 0 ]]; then
  echo
  echo "Fix failures before registering on x402scan."
  echo "See: https://x402scan.com/discovery/spec"
  exit 1
fi

echo
echo "✓  Compliance check passed. Register at:"
echo "   https://x402scan.com  → paste: $BASE/openapi.json"
