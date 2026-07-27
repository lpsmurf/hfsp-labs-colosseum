---
name: x402-commerce
description: >-
  Ship a paid API that AI agents can DISCOVER and BUY FROM over x402 on Solana.
  The commerce layer the happy-path tutorials skip: a discoverable
  `.well-known/x402` manifest + Bazaar listing, per-call pricing economics, a
  buyer agent that shops across multiple sellers, and verify-then-deliver
  settlement (replay + freshness + resource binding). Use when building,
  pricing, listing, or consuming an x402 / HTTP-402 paid endpoint — especially
  on Solana (USDC SPL). Pairs with solana-x402-seller-security (defense); this
  is the get-paid + get-discovered side.
license: MIT
---

# x402 Commerce Skill

Most x402 material teaches you to *accept* a payment. The security skills teach you
to accept one *without getting drained*. **Neither teaches you how an agent finds
your endpoint, what to charge, or how to buy from someone else.** This skill is the
commerce layer: **discovery → pricing → buying → settlement-verified delivery.**

It is grounded in a working, multi-product x402 stack (`@hfsp/x402-sdk`, Bazaar
discovery, live Solana + Base sellers) — not a thought experiment.

> **Scope:** the *commerce* layer (monetize + be discovered + shop across sellers).
> For the *defense* layer (the five 2026 attack classes, seller-side linting) load
> the sibling `solana-x402-seller-security` skill — they compose.

## Proof it runs (≈30 seconds, zero external services)

The bundled example stands up a real x402 seller (`@hfsp/x402-sdk`) and runs a
buyer agent that **discovers it, pays on devnet, and consumes the paid route** —
end to end, on your machine:

```bash
cd skill/examples/buyer-seller-local
npm install && npm run demo      # seller + buyer-agent, full 402 → pay → 200 loop
```

And validate any seller's discovery manifest with the bundled linter (zero deps):

```bash
node skill/checker/x402-commerce-lint.mjs https://your-seller/.well-known/x402
node skill/checker/x402-commerce-lint.mjs manifest.json --json
node --test skill/checker/x402-commerce-lint.test.mjs
```

Exit `0` = listing is agent-discoverable and safe to monetize; `1` = a CRITICAL/HIGH
commerce defect (unpriceable, undiscoverable, or unsafe to charge for).

## Commerce invariants → status in the reference stack

| Commerce invariant | Why it matters to an agent buyer | Status (`@hfsp` stack) |
|---|---|---|
| **C1 Discoverable** — `.well-known/x402` + Bazaar `extensions.bazaar` | an agent can't buy what it can't find or describe | **LIVE** — SDK emits the Bazaar extension in every 402 |
| **C2 Priceable** — integer atomic amount + asset mint, machine-readable | the buyer must compute cost before paying | **LIVE** — `amount` (micro-USDC) + `asset` in `accepts[]` |
| **C3 Bindable** — resource binding advertised for non-idempotent routes | a paid signature must not unlock a different route | **LIVE (opt-in)** — `extra.memo` advertised; client attaches it |
| **C4 Fresh** — bounded payment-to-delivery window | stale signatures can't be redeemed later | **LIVE** — 300s freshness default in verify |
| **C5 Shoppable** — a buyer can compare ≥2 sellers on price/schema | commerce needs a market, not one seller | **CHECKER** — buyer-agent ranks sellers by net cost |
| **C6 Non-leaking** — paid responses `no-store, private` | a CDN must not serve a paid result for free | **LIVE** — middleware sets the header |

Honest by design: `CHECKER`/`opt-in` are shown, not hidden.

## Routing — load only what you need

| You want to… | Read |
|---|---|
| Make your endpoint discoverable (`.well-known/x402`, Bazaar listing) | [`01-discovery.md`](01-discovery.md) |
| Decide what to charge (per-call pricing, markup, micro-economics) | [`02-pricing-economics.md`](02-pricing-economics.md) |
| Build a buyer agent that shops across sellers and pays | [`03-buyer-agent.md`](03-buyer-agent.md) |
| Verify-then-deliver correctly (replay, freshness, binding) | [`04-settlement-delivery.md`](04-settlement-delivery.md) |
| Go-live commerce checklist | [`05-checklist.md`](05-checklist.md) |

## The 5-minute path

1. Gate a route with `@hfsp/x402-sdk` (`x402({ amount, payTo, rpcUrl })`) — you now
   emit a spec-compliant 402 with a Bazaar extension (**C1, C2**).
2. Add `resourceId` to non-idempotent routes (**C3**); freshness + `no-store` are on
   by default (**C4, C6**).
3. Publish a `.well-known/x402` manifest listing your routes — see `01-discovery.md`.
4. Run `x402-commerce-lint` against it until it's green.
5. Point the buyer agent (`03-buyer-agent.md`) at one or more sellers; it discovers,
   ranks, pays, and consumes (**C5**).
