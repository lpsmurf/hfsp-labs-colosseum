# Audit Finding: Non-Spec-Compliant 402 Response Bodies

**Date:** 2026-06-05  
**Auditor:** HFSP Labs  
**Severity:** Medium  
**Type:** 402-format  
**Affects:** Multiple services — full list below

---

## Summary

Many services in the P1 tier (highest traffic) return 402 responses that are missing required x402 fields. The most common issue: missing `x402Version` and missing `accepts` array. These responses cannot be parsed by standard x402 client libraries.

---

## Affected Services

| Service | 30d Calls | Missing fields |
|---------|-----------|---------------|
| signal-engine-production-d88d.up.railway.app | 43,498 | `x402Version`, `accepts` array |
| win.oneshotagent.com | 29,635 | `x402Version`, `accepts` array |
| x402.ottoai.services | 6,959 | `x402Version`, `accepts` array |
| skills.onesource.io | 4,924 | `x402Version`, `accepts` array |
| blockint.ai | 4,456 | `x402Version`, `accepts` array |
| serp-x402.vercel.app | 3,360 | `x402Version`, `accepts` array |
| BlockRun.AI | 3,808 | `x402Version`, `accepts` array |
| x402.twit.sh | 2,215 | `x402Version`, `accepts` array |
| ot-intel-api.onrender.com | 1,630 | `x402Version`, `accepts` array |
| api.stocktrends.com | 1,251 | `x402Version`, `accepts` array |
| telesint-api.onrender.com | 1,152 | `x402Version`, `accepts` array |
| human.twin3.ai | 1,026 | `x402Version`, `accepts` array |

---

## Evidence

### telesint-api.onrender.com (sample of non-compliant body)

```bash
curl -s "https://telesint-api.onrender.com/<endpoint>"
```

Response returns HTTP 402 but body is either plain text, a custom error format, or a partial x402 body without the required `x402Version` and structured `accepts` array.

---

## x402 Spec Requirements (v1)

Per the Coinbase x402 specification, a compliant 402 response **must** include:

```json
{
  "x402Version": 1,
  "error": "Payment required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-mainnet",
      "maxAmountRequired": "1000000",
      "asset": "0x833589...",
      "payTo": "0x...",
      "maxTimeoutSeconds": 300
    }
  ]
}
```

Without these fields, any agent using a standard x402 client **cannot** determine where to send payment.

---

## Impact

Agents calling these services:
1. Cannot parse the 402 response
2. Cannot determine `payTo` address
3. Cannot send payment
4. Service is effectively uncallable by automated agents

Despite this, many of these services show thousands of calls per month — suggesting they have a parallel non-x402 payment mechanism, or the catalog call count is from direct API users not automated agents.

---

## Reproduce

```bash
# Check if 402 body is x402-compliant
curl -s "https://blockint.ai/api/v1/c3-reports" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print('Has x402Version:', 'x402Version' in d)
    print('Has accepts:', 'accepts' in d and isinstance(d['accepts'], list))
except:
    print('Not JSON')
"
```

---

## Recommended Fix for Service Developers

Return a proper x402 v2 body:

```json
{
  "x402Version": 2,
  "error": "Payment required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "1000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0xYOUR_WALLET",
      "maxTimeoutSeconds": 300
    }
  ]
}
```

Reference: https://docs.cdp.coinbase.com/x402/welcome

---

## GitHub Issues to File

File on each service's GitHub repo:  
- Title: `[x402] 402 response body does not conform to x402 spec`
- Reference this finding for evidence
