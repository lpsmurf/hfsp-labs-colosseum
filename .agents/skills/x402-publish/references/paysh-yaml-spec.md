# pay.sh Provider YAML Spec

Source: https://pay.sh/docs/building-with-pay/yaml-specification/index.md  
Submit to: https://github.com/solana-foundation/pay-skills → `providers/{name}/{name}.yml`

---

## Required Top-Level Fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Machine-readable. Lowercase, hyphenated. |
| `subdomain` | string | Stable catalog identifier. |
| `title` | string | Human-readable provider title. |
| `description` | string | One-line catalog summary. |
| `category` | enum | See categories below. |
| `version` | string | Free-form (`v1`, `2026-06-14`, `1.0.0`). |

---

## Categories (enum)

`ai_ml`, `cloud`, `compute`, `data`, `devtools`, `finance`, `identity`,
`maps`, `media`, `messaging`, `productivity`, `search`, `security`,
`shopping`, `storage`, `translation`, `other`

---

## Routing

```yaml
# Forward to upstream after payment verified
routing:
  type: proxy
  url: https://your-service.com/

# Return 200 directly (no upstream call, for prototyping)
routing:
  type: respond
```

---

## Operator

```yaml
operator:
  currencies:
    usd: ['USDC']
  network: mainnet          # mainnet | devnet | localnet
  recipient: 'YOUR_WALLET'  # Solana wallet for payments
  fee_payer: true           # operator co-signs as fee payer
```

---

## Endpoints

Each endpoint must have `method`, `path`, and one of: `metering` (pay-per-call)
or `subscription` (recurring).

### Free endpoint

```yaml
endpoints:
  - method: GET
    path: 'health'
    description: 'Health check (free).'
```

### Metered endpoint

```yaml
endpoints:
  - method: GET
    path: 'assets'
    description: 'List all xStock assets.'
    metering:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 0.005    # dollars per request
```

---

## Full example

```yaml
name: xstocks-feed
subdomain: xstocks-feed
title: 'xStocks Price Feed'
description: 'Pay-per-request xStocks price oracle. Real-time NAV prices for 100+ tokenized equities.'
category: finance
version: v1

routing:
  type: proxy
  url: https://feed.xstocks.hfsp.cloud/

operator:
  currencies:
    usd: ['USDC']
  network: mainnet
  recipient: 'GdAWRcvrVabFi6QtciGJNYsS8cykJkZTNZ3cFea6ywfY'

endpoints:
  - method: GET
    path: 'health'
    description: 'Health check (free).'

  - method: GET
    path: 'assets'
    description: 'List all xStock assets.'
    metering:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 0.005

  - method: GET
    path: 'assets/{symbol}/price'
    description: 'Get live NAV price for a symbol.'
    metering:
      dimensions:
        - direction: usage
          unit: requests
          scale: 1
          tiers:
            - price_usd: 0.005
```

---

## PR checklist for solana-foundation/pay-skills

- [ ] File placed at `providers/{name}/{name}.yml`
- [ ] `name` and `subdomain` match the directory name
- [ ] `routing.url` points to live HTTPS endpoint
- [ ] At least one metered endpoint with `price_usd`
- [ ] PR title: `feat: add {Title} provider`
- [ ] Live service is deployed and returning 402 on unauthenticated requests
