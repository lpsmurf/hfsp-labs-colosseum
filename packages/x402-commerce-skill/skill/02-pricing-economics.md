# 02 — Pricing economics: what to charge

x402 only matters if the price clears the market of *agents*, not humans. Different
math.

## Units (get this exact or you ship a 1000× mispricing)

`amount` is **integer atomic USDC = micro-USDC** (6 decimals). $0.005 = `5000n`.
Never a float, never dollars. The linter flags non-integer amounts as CRITICAL —
a `"0.005"` in `accepts[].amount` means "5000 USDC" to a strict buyer.

| Price | `amount` |
|---|---|
| $0.001 | `1000n` |
| $0.005 | `5000n` |
| $0.05  | `50000n` |
| $0.50  | `500000n` |

## Floor: never price below cost

```
price_min  =  rpc_cost_per_call + compute_cost + settlement_overhead + margin
```

On Solana the settlement overhead is the buyer's (gas + ATA), so your floor is
basically your compute + a margin. Micro-margins work because volume is agentic.

## Three pricing shapes

1. **Flat per-call** — simplest; one `amount` per route. Best for deterministic
   compute (a score, a lookup). Pairs cleanly with resource binding (one memo,
   one price).
2. **Tiered by route** — cheap routes cheap, expensive routes expensive. Each route
   has its own `accepts[].amount`. The manifest makes the menu legible.
3. **Markup reseller** — you wrap an upstream paid API and add commission. Your
   price = upstream price + markup; verify upstream delivery before you deliver.
   (This is the `x402-store` pattern: gift cards / data resold at a margin.)

## Agent-buyer psychology (how you get picked)

A buyer agent shopping across sellers ranks on **net cost to satisfy the task**, not
sticker price:

```
net_cost = amount + expected_retries·amount + schema_risk_penalty
```

- A truthful `output.example` lowers `schema_risk_penalty` → you win ties.
- High verify-failure rates inflate `expected_retries` → you lose even if cheapest.
- Freshness/binding done right = predictable settlement = lower risk weighting.

**Implication:** reliability and honest schemas are a pricing advantage, not just
hygiene. The cheapest flaky seller loses to the slightly-pricier dependable one.

## Don't

- Don't price in dollars or floats (units bug = catastrophic).
- Don't charge for idempotent GETs without binding — buyers replay and you "lose"
  the sale to your own cache. Set `resourceId` or `no-store` (both default-safe here).
- Don't hide fees off-manifest; an agent that discovers a surprise cost de-ranks you.
