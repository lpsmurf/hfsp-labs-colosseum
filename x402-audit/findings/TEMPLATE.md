# Audit: [Service Name]

**Date:** YYYY-MM-DD  
**Auditor:** HFSP Labs  
**Service ID:** `<id from agentic.market>`  
**Provider URL:** <url>  
**Category:** <category>  
**Networks:** Base / Solana  
**30d Calls:** <number>  **Payers:** <number>

---

## Endpoints Tested

| Endpoint | Method | Listed Price | Actual Charge | Result |
|----------|--------|-------------|---------------|--------|
| `/path` | POST | $0.001 | $0.001 | ✅ / ⚠️ / ❌ |

---

## 402 Response Check

```json
// Paste the raw 402 response here
```

**x402 spec compliance:**
- [ ] `x402Version` field present
- [ ] `accepts` array with correct fields (`scheme`, `network`, `maxAmountRequired`, `asset`, `payTo`)
- [ ] `maxTimeoutSeconds` present
- [ ] Network matches what's advertised

---

## Payment Flow Test

**Chain used:** Base / Solana  
**Tx hash / signature:** `<hash>`  
**Amount sent:** $X USDC  
**Payment accepted:** Yes / No / Error  

```
// Response after payment:
```

---

## Idempotency & Replay Test

- [ ] Replayed same signature → got `409` or equivalent (expected)
- [ ] Expired tx (>maxTimeoutSeconds) → rejected (expected)
- [ ] Wrong amount → rejected (expected)

---

## Response Quality

**What was advertised:** <copy from their docs>  
**What was returned:** <actual response>  
**Correct/useful:** Yes / Partial / No

---

## Bugs Found

### Bug 1: <title>

**Severity:** Critical / High / Medium / Low  
**Type:** `402-format` | `payment-verification` | `response-quality` | `cors` | `pricing` | `broken`

**Steps to reproduce:**
1. 
2. 

**Expected:** 

**Actual:** 

**Evidence:**
```
// curl command + response
```

---

## Overall Rating

| Dimension | Score (1–5) | Notes |
|-----------|-------------|-------|
| 402 compliance | | |
| Response quality | | |
| Pricing accuracy | | |
| Reliability | | |
| Documentation | | |
| **Overall** | | |

---

## GitHub Issue

- [ ] Issue filed: <url>
- [ ] Response received: 
