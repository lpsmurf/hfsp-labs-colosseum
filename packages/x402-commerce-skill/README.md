# x402-commerce — Solana AI Kit skill

**Ship a paid API that AI agents can discover and buy from over x402 on Solana.**

The commerce layer the happy-path x402 tutorials skip — and the half the security
skills explicitly exclude. Discovery (`/.well-known/x402` + Bazaar) → pricing
economics → a buyer agent that shops across sellers → settlement-verified delivery.

> Pairs with `solana-x402-seller-security` (the *defense* layer): that skill teaches
> you not to get drained; this one teaches you how to get **discovered and paid**.

## What's inside

```
skill/
  SKILL.md                       router + commerce-invariant status table (C1–C6)
  01-discovery.md                .well-known/x402 + Bazaar listing
  02-pricing-economics.md        micro-USDC units, floors, agent-buyer ranking
  03-buyer-agent.md              discover → rank across sellers → pay → consume
  04-settlement-delivery.md      verify-then-deliver: replay, freshness, binding
  05-checklist.md                go-live commerce checklist
  checker/x402-commerce-lint.mjs zero-dep manifest linter (+ tests + fixtures)
  examples/buyer-seller-local/   runnable: real seller + buyer agent, full loop
```

## Try it (≈30s, zero external services)

```bash
# 1. Lint any seller's discovery manifest
node skill/checker/x402-commerce-lint.mjs skill/checker/fixtures/safe-manifest.json
node skill/checker/x402-commerce-lint.mjs skill/checker/fixtures/vuln-float-and-lowercased.json   # NO-GO
node --test skill/checker/x402-commerce-lint.test.mjs

# 2. Run the full discover → lint → rank → challenge → pay loop
cd skill/examples/buyer-seller-local && npm install && npm run demo
```

## Grounded in shipping infrastructure

Built on `@hfsp/x402-sdk` (replay + freshness + resource-binding + no-store paid
responses) and the Bazaar discovery extension — the same stack behind live Solana +
Base x402 sellers. Not docs-only: the bundled example is a real seller + buyer.

## Install into a Solana AI Kit project

```bash
bash install.sh /path/to/your-project   # copies skill/ into .claude/skills/x402-commerce/
```

MIT licensed. Contact: info@hfsp.xyz
