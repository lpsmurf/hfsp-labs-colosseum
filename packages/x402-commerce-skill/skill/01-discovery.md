# 01 — Discovery: be found and be described

An agent buyer can't pay for what it can't find or describe. Two layers make an
x402 endpoint discoverable.

## Layer 1 — the per-response challenge (you get this free)

Every 402 from `@hfsp/x402-sdk` already carries a machine-readable `accepts[]` and,
when configured, a **Bazaar extension** describing the route's I/O schema:

```jsonc
{
  "x402Version": 2,
  "resource": { "url": "https://api.acme.ai/score", "description": "...", "mimeType": "application/json" },
  "accepts": [{
    "scheme": "exact", "network": "solana:5eykt4...",
    "amount": "5000",                 // integer micro-USDC ($0.005) — C2
    "asset":  "EPjFW...TDt1v",         // USDC mint (base58, never lowercased)
    "payTo":  "Gd...wfY",
    "maxTimeoutSeconds": 300,
    "extra":  { "memo": "/score" }     // resource binding advertised — C3
  }],
  "extensions": { "bazaar": { "info": { "input": {...}, "output": {...} }, "schema": {...} } }
}
```

Enable the Bazaar extension by passing `bazaar` to the middleware:

```ts
x402({
  amount: 5_000n, payTo, rpcUrl, resourceId: "/score",
  bazaar: {
    method: "POST",
    output: { example: { score: 0.91 }, schema: { type: "object", properties: { score: { type: "number" } } } },
  },
});
```

## Layer 2 — the site manifest (`/.well-known/x402`)

A single document that lists *every* paid route so a crawler/agent can enumerate
your catalog without probing each path. Serve it static or generate it:

```jsonc
// GET https://api.acme.ai/.well-known/x402
{
  "x402Version": 2,
  "seller":   { "name": "Acme AI", "contact": "info@acme.ai" },
  "networks": ["solana:5eykt4..."],
  "resources": [
    {
      "url": "https://api.acme.ai/score",
      "description": "Toxicity score for a string",
      "accepts": [{ "scheme": "exact", "network": "solana:5eykt4...", "amount": "5000",
                    "asset": "EPjFW...TDt1v", "payTo": "Gd...wfY", "extra": { "memo": "/score" } }]
    }
  ]
}
```

Run `x402-commerce-lint` against this URL/file until green — it enforces C1–C6
(integer amounts, real base58 mint not lowercased, binding advertised, etc.).

## Bazaar / marketplace listing

Bazaar-compatible indexers (agentic.market, x402.org/discovery) crawl the
`extensions.bazaar` block. Keep `output.example` truthful — buyers rank on it.
The richer and more honest your schema, the higher you rank in agent shortlists.
