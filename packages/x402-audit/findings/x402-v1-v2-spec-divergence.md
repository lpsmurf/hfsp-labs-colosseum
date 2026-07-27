# Audit Finding: x402 v1 vs v2 Spec Divergence — Agent Parsing Breakage

**Date:** 2026-06-05  
**Auditor:** HFSP Labs  
**Severity:** High  
**Type:** spec-compatibility  
**Affects:** orbisapi.com, Nansen, Exa, molty.cash — and likely most services using the Coinbase SDK

---

## Summary

The x402 spec has evolved from v1 to v2, changing the field name for the payment amount in the `accepts` array. This causes silent breakage for any agent built against the v1 spec trying to call v2 services (the top-traffic services on agentic.market).

**v1 field:** `maxAmountRequired`  
**v2 field:** `amount`

---

## Services Affected

| Service | 30d Calls | Payers | x402Version | Amount field used |
|---------|-----------|--------|-------------|-------------------|
| orbisapi.com | 96,813 | 27,093 | 2 | `amount` |
| Nansen | 4,162 | 168 | 2 | `amount` |
| Exa | 1,884 | 116 | 2 | `amount` |
| api.molty.cash | 5,364 | 36 | 2 | `amount` |

---

## Evidence

### orbisapi.com 402 response (x402Version: 2)

```json
{
  "x402Version": 2,
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "5000",
      "payTo": "0x2bb72231EeD303cc91a462A1fA738b42B6a9ac6d",
      "maxTimeoutSeconds": 60,
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    }
  ]
}
```

### Nansen 402 response (x402Version: 2, 3 networks)

```json
{
  "x402Version": 2,
  "accepts": [
    { "scheme": "exact", "network": "eip155:8453", "asset": "0x833589...", "amount": "50000", "payTo": "0x93053f...", "maxTimeoutSeconds": 300 },
    { "scheme": "exact", "network": "eip155:196",  "asset": "0x779Ded...", "amount": "50000", "payTo": "0x93053f...", "maxTimeoutSeconds": 300 },
    { "scheme": "exact", "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", "asset": "EPjFWdd5...", "amount": "50000", "payTo": "J7ZvJEspvwP1oRxQZ7mYmNmT22NTm3GWq3t7HEbvPZYx", "maxTimeoutSeconds": 300 }
  ]
}
```

### Exa 402 response (x402Version: 2)

```json
{
  "x402Version": 2,
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "amount": "7000",
      "payTo": "0x6d6E695b09861467c7d462f5AAF31cF3540B9192",
      "maxTimeoutSeconds": 60,
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    }
  ]
}
```

---

## Network Format Inconsistency (Bonus Finding)

The `network` field has no consistent format across services:

| Service | Network format |
|---------|---------------|
| orbisapi.com | `eip155:8453` / `solana` |
| Nansen | `eip155:8453` / `eip155:196` / `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Exa | `eip155:8453` |
| x402-wallet (our code) | `base-mainnet` / `solana-mainnet` |
| Coinbase x402 SDK | `base-mainnet` |

Agents parsing `network === 'base-mainnet'` will not match `eip155:8453` — causing them to skip valid payment options.

---

## Impact

Any agent or SDK that:
1. Checks `accepts[i].maxAmountRequired` to determine payment amount → gets `undefined` on v2 services → sends $0 or errors
2. Checks `network === 'base-mainnet'` → skips all v2 services using `eip155:8453`

This affects every agent built with the Coinbase x402 client SDK if the SDK hasn't been updated to handle v2.

---

## Reproduce

```bash
# No payment header → 402 with v2 body
curl -s "https://orbisapi.com/api/proxy/gas-fee-estimator-api-a96f58/estimate"
# Look for "amount" (v2) not "maxAmountRequired" (v1)

curl -s -X POST "https://api.nansen.ai/api/v1/perp-leaderboard" \
  -H "Content-Type: application/json" -d '{}'
```

---

## Recommended Fix for Agents

Handle both versions:

```typescript
function getAmount(accept: X402Accept): string {
  return accept.maxAmountRequired ?? accept.amount ?? '0';
}

function matchesNetwork(accept: X402Accept, chain: 'base' | 'solana'): boolean {
  const n = accept.network ?? '';
  if (chain === 'base') return n === 'base-mainnet' || n === 'eip155:8453';
  if (chain === 'solana') return n === 'solana-mainnet' || n === 'solana' || n.startsWith('solana:');
  return false;
}
```

---

## GitHub Issues to File

- [ ] Coinbase x402 SDK: document v1→v2 migration for `maxAmountRequired` → `amount`
- [ ] agentic.market: update compatibility docs to note v2 field names
- [ ] orbisapi.com: link to x402 spec for other developers
- [ ] Exa: spec link in 402 response

---

## Notes

- orbisapi.com also supports **API key** auth as an alternative to x402 (`alternativeAuth` field)
- Exa has an **AgentKit SIWE** extension for a "free trial" mode (100 uses) before paying
- Nansen supports XLayer (`eip155:196`) which is unusual — worth testing
