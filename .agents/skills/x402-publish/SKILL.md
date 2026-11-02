---
name: x402-publish
description: Generate all marketplace listing artifacts for a new x402-gated API service — OpenAPI discovery doc (`/openapi.json`), pay.sh provider YAML, and x402scan compliance validation. TRIGGER whenever the user finishes building an x402 Express/Node service and wants to list it on x402scan.com or pay.sh, or says "publish", "list", "register", or "make discoverable" in the context of an x402 API. SKIP for non-x402 payment flows, for pure frontend apps, or when the user only wants to add payment to an existing third-party service. Pairs with the Solana Agent Kit skill — Agent Kit builds the agent that pays for and consumes x402 APIs; this skill builds the provider side so your API is discoverable by those agents.
allowed-tools: Read, Write, Bash
---

# x402 Publish — Make Any x402 Service Discoverable

Generates the three artifacts every x402 service needs to list on
**x402scan.com** and **pay.sh**:

1. **`/openapi.json` route** — TypeScript/Express code, spec-compliant with
   `draft-payment-discovery-00`, accepted by x402scan.
2. **pay.sh YAML** — Provider spec for the `solana-foundation/pay-skills`
   registry.
3. **Compliance report** — Probes the live endpoint and checks all x402scan
   requirements before you submit.

---

## Works with Solana Agent Kit

This skill and the [Solana Agent Kit skill](https://github.com/sendaifun/skills/tree/main/skills/solana-agent-kit) cover opposite sides of the x402 ecosystem:

| | Solana Agent Kit | x402 Publish |
|---|---|---|
| **Role** | Consumer — the agent that pays for APIs | Provider — the API that agents pay for |
| **What it builds** | AI agents with 60+ on-chain actions (swap, stake, NFT, DeFi) | Discovery docs, marketplace listings, compliance reports |
| **Output** | Agent code that calls x402-gated endpoints | `/openapi.json` route + pay.sh YAML + x402scan registration |
| **Registers on** | Discovers services via `/openapi.json` | x402scan.com + pay.sh |

**The full loop:**
```
You build a paid data API (price feed, oracle, analytics)
         ↓ x402 Publish
  /openapi.json · x402scan · pay.sh listing
         ↓
  Solana Agent Kit agent discovers it
         ↓
  Agent pays USDC via x402, calls your API autonomously
```

Use **x402 Publish** when you're building the API being sold.
Use **Solana Agent Kit** when you're building the agent that buys.

---

## What You Need Before Running

Collect these from the service you just built:

| Field | Example |
|---|---|
| `baseUrl` | `https://feed.xstocks.hfsp.cloud` |
| `name` | `xstocks-feed` (slug, lowercase-hyphenated) |
| `title` | `xStocks Price Feed` |
| `description` | One-line summary shown in listings |
| `amount` | `5000` (micro-USDC, $0.005 = 5000) |
| `payTo` | Solana wallet that receives payments |
| `categories` | Up to 5 from: `data`, `finance`, `compute`, `ai_ml`, `devtools`, `search`, `storage`, `media`, `messaging`, `security`, `identity`, `maps`, `travel`, `social`, `shopping`, `other` |
| Gated routes | List of `{path, method, summary, params[], responseSchema}` |

The service must already be deployed and returning HTTP 402 (with
`payment-required` header) on unauthenticated requests to gated endpoints.

---

## Workflow

### Step 1 — Build the service config

Write a `service.json` file (see [`examples/`](examples/)) describing the
service. Then run:

```bash
python3 .agents/skills/x402-publish/scripts/generate_discovery.py service.json
```

This outputs a TypeScript snippet — the complete `/openapi.json` route — ready
to paste into your Express app (or into a new `openapi.ts` module).

### Step 2 — Add the route to your Express app

Mount the generated route **before** your 404 handler and **before** the x402
payment gate:

```typescript
import { openApiDoc } from "./openapi.js";

// Free — no gate
app.get("/openapi.json", (_req, res) => {
  res.setHeader("Cache-Control", "max-age=300");
  res.json(openApiDoc);
});

// Gated endpoints below...
app.get("/your-route", gate, handler);
```

### Step 3 — Generate the pay.sh YAML

```bash
python3 .agents/skills/x402-publish/scripts/generate_paysh.py service.json
```

Output: a `{name}.yml` file ready to PR into
`solana-foundation/pay-skills` under `providers/{your-slug}/`.

### Step 4 — Validate compliance

After deploying the `/openapi.json` endpoint:

```bash
bash .agents/skills/x402-publish/scripts/validate_compliance.sh https://your-service.com
```

Checks:
- `GET /openapi.json` returns HTTP 200, `Content-Type: application/json`
- Every paid path has `x-payment-info` with `intent`, `method`, `amount`, `currency`
- Every paid path declares a `"402"` response
- Every paid path has at least one input parameter or requestBody
- Every paid path has an output schema on the `"200"` response
- Free paths declare `"security": []`
- Probing paid paths without payment returns HTTP 402 with `payment-required` header
- `payment-required` header decodes to valid x402 v2 JSON with `x402Version: 2`

### Step 5 — Register on x402scan

Once validation passes, go to **https://x402scan.com** and register:
```
https://your-service.com/openapi.json
```

### Step 6 — Submit to pay.sh

Open a PR to `solana-foundation/pay-skills`:
- Add the generated YAML to `providers/{your-slug}/{service-name}.yml`
- Follow their PR template

---

## OpenAPI spec requirements (x402scan)

Per `draft-payment-discovery-00` and x402scan's validator:

| Requirement | Field |
|---|---|
| Discovery URL | `GET /openapi.json` — must return 200, no payment gate |
| Free endpoints | Declare `"security": []` in the operation |
| Paid endpoints | Include `"x-payment-info"` extension with `offers[]` |
| Payment offer fields | `intent` (charge/session), `method` (x402), `amount` (micro-units string), `currency` (mint address) |
| 402 response | Every paid op must declare `"402": { "description": "Payment Required" }` |
| Input schema | Every paid op must have ≥1 parameter with `schema`, or a `requestBody` |
| Output schema | Every paid op's `"200"` response should have `content.application/json.schema` |
| Service metadata | Top-level `"x-service-info"` with `categories[]` and `docs{}` |
| Caching | `Cache-Control: max-age=300` on the `/openapi.json` response |

## pay.sh YAML requirements

Per the pay-skills YAML specification:

| Field | Notes |
|---|---|
| `name` | Machine-readable, lowercase-hyphenated |
| `subdomain` | Your stable catalog identifier |
| `title` | Human-readable |
| `description` | One-line catalog summary |
| `category` | One of the pay.sh category enum values |
| `version` | Free-form (`v1`, `2026-06-14`, etc.) |
| `routing.type` | `proxy` for live upstreams; `respond` for prototyping |
| `routing.url` | Your service base URL |
| `operator.currencies` | `{ usd: ['USDC'] }` for Solana USDC |
| `operator.network` | `mainnet` for production |
| `endpoints[]` | Each with `method`, `path`, `description`, `metering` |
| Metering | `dimensions[0].tiers[0].price_usd` = price in dollars |

---

## Common errors and fixes

| Error | Fix |
|---|---|
| `Missing input schema` | Add `parameters[]` with `schema` fields, or a `requestBody` |
| `Missing output schema` | Add `content.application/json.schema` to the `"200"` response |
| `No valid x402 response found (HTTP 200)` | If the operation is intentionally free, declare it with `"security": []`. If it should be paid, fix the payment middleware (route order, gate not applied) so unauthenticated requests return HTTP 402 |
| `payment-required header missing` | Your x402 middleware isn't running — check route order |
| `x402Version not 2` | Upgrade your x402 SDK to emit v2 challenges |
| Certbot / SSL fails | DNS record not propagated — add A record in **Cloudflare** (not Hostinger) for `hfsp.cloud` domains |

---

## Files in this skill

- [`scripts/generate_discovery.py`](scripts/generate_discovery.py) — generates `/openapi.json` TypeScript route from `service.json`
- [`scripts/generate_paysh.py`](scripts/generate_paysh.py) — generates pay.sh YAML provider spec
- [`scripts/validate_compliance.sh`](scripts/validate_compliance.sh) — probes live endpoint for x402scan compliance
- [`examples/minimal.json`](examples/minimal.json) — simplest possible service config
- [`examples/xstocks-feed.json`](examples/xstocks-feed.json) — full reference config (xStocks Price Feed)
- [`references/payment-discovery-spec.md`](references/payment-discovery-spec.md) — key excerpts from `draft-payment-discovery-00`
- [`references/paysh-yaml-spec.md`](references/paysh-yaml-spec.md) — pay.sh YAML field reference
