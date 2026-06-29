# 03 — The buyer agent: shop across sellers, then pay

The half nobody ships. A real agentic market needs a *buyer* that discovers
candidates, compares them, pays the winner, and consumes the result — not a
hard-coded single seller.

## The buyer loop

```
discover(sellers[])  →  rank(by net_cost + schema fit)  →  pay(winner)  →  consume  →  record(CLV)
```

1. **Discover** — fetch each seller's `/.well-known/x402` (or trigger a 402 and read
   `accepts[]` + `extensions.bazaar`). Drop any that fail `x402-commerce-lint`.
2. **Rank** — score on `net_cost` (02) and whether the output schema satisfies the
   task. Cheapest-that-fits wins; flaky/over-priced lose.
3. **Pay + consume** — hand the winning challenge to the `@hfsp` client; it pays,
   attaches the binding memo if advertised, and retries with `X-Solana-Tx`.

```ts
import { X402Client } from "@hfsp/x402-sdk/client";
import { Keypair } from "@solana/web3.js";

const client = new X402Client({ wallet, rpcUrl });

// The client handles the whole 402 → pay → 200 loop, including resource-binding memo.
const res  = await client.fetch(winner.url, { method: "POST", body: JSON.stringify(task) });
const data = await res.json();
```

## Ranking across sellers (the shoppable part — C5)

```ts
function rank(candidates) {
  return candidates
    .filter((c) => lintOk(c.manifest))                 // discoverable + safe
    .map((c) => ({ c, net: netCost(c) }))              // amount + retry risk + schema penalty
    .sort((a, b) => a.net - b.net)
    .map((x) => x.c);
}
```

Net cost, not sticker price (see 02). A buyer that only reads `amount` gets fleeced
by a cheap seller that fails verification half the time.

## Spend governance (compose, don't reinvent)

A buyer that pays autonomously needs spend caps + per-counterparty limits. **Don't
build that here** — compose with on-chain governance (Squads-based limits) and a
pre-sign policy. This skill stops at "pick + pay + consume"; the guardrail layer is
a separate concern by design.

## Closing-line value for data buyers

If you're buying *signals* (prices, odds, predictions), record the CLV: did the
signal you paid for beat the market close? Over time this turns "which seller is
cheapest" into "which seller is *profitable*" — the only ranking that matters for
alpha. This is where commerce meets the trading layer the security skills exclude.
