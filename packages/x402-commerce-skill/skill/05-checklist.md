# 05 — Go-live commerce checklist

Run top to bottom before you list a paid endpoint for agents.

## Discoverable (C1)
- [ ] Every paid route returns a spec-compliant 402 with `accepts[]`.
- [ ] `extensions.bazaar` present with a **truthful** `output.example` + schema.
- [ ] `/.well-known/x402` lists every route; `x402-commerce-lint <url>` is green.

## Priceable (C2)
- [ ] `amount` is an **integer** string of micro-USDC (no floats, no dollars).
- [ ] `asset` is the correct mint, **base58 case preserved** (never `.toLowerCase()`).
- [ ] Price ≥ floor (rpc + compute + margin); tiers legible in the manifest.

## Bindable & fresh (C3, C4)
- [ ] Non-idempotent / priced-per-result routes set `resourceId` (binding memo).
- [ ] `maxAgeSeconds` set sensibly (default 300); buyer retries land inside it.

## Settlement (the delivery contract)
- [ ] Replay store is **Redis** if you run more than one instance.
- [ ] Verify → fresh → bound → deliver order is intact; failures `release()` the sig.
- [ ] Paid responses are `no-store, private` (default; not overridden by the handler).

## Shoppable (C5)
- [ ] A buyer can rank you against ≥1 competitor on net cost + schema fit.
- [ ] Verify-failure rate is low (high failures inflate buyers' retry cost → de-rank).

## Non-leaking (C6)
- [ ] No paid result is cacheable by a proxy/CDN.
- [ ] No paid data echoed in the 402 (the challenge is pre-payment, keep it free of
      the goods).

## Proof for reviewers / buyers
- [ ] `curl -i https://your-seller/route` shows a real 402 (paste it).
- [ ] One explorer tx link of a real settled payment to `payTo`.
- [ ] `npm run demo` (bundled example) runs the full discover → pay → consume loop.

## Compose, don't reinvent
- [ ] Seller-side attack defense → `solana-x402-seller-security`.
- [ ] Autonomous-buyer spend caps → on-chain spend-limit / pre-sign policy skill.
- [ ] This skill owns: discovery, pricing, the buyer market, delivery economics.
