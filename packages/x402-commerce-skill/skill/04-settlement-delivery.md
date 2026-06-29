# 04 — Settlement & delivery: charge once, deliver once

Commerce dies if a buyer pays and gets nothing, or pays once and takes forever. The
delivery contract has four guarantees, all enforced by `@hfsp/x402-sdk`'s verify
step. (For the full attack taxonomy, load `solana-x402-seller-security`.)

## The verify-then-deliver order (never invert it)

```
claim(txSig)            // atomic replay claim BEFORE any RPC — one signature, one sale
  → verifyTx(...)       // confirm mint + payTo + amount on-chain
      → fresh?          // blockTime within maxAgeSeconds (R9)
      → bound?          // memo == resourceId, if set (R2)
  → deliver             // only now; response is no-store, private (R8)
  → on failure: release(txSig)   // let an honest buyer retry
```

Mapping to the SDK config:

```ts
x402({
  amount: 5_000n,
  payTo,
  rpcUrl,
  resourceId:    "/score",   // R2 binding — payment can't unlock another route
  maxAgeSeconds: 300,        // R9 freshness — 0 disables, default 300
  replayStore:   new RedisReplayStore(redis),  // R3/R4/R10 across instances
});
```

## Why each guarantee is a *commerce* guarantee, not just security

| Guarantee | Commerce failure it prevents |
|---|---|
| Replay (claim-before-verify) | buyer redeems one payment for N deliveries → you give away inventory |
| Freshness (blockTime window) | a stale signature is reused weeks later → unaccounted delivery |
| Resource binding (memo) | payment for cheap route A unlocks expensive route B → revenue leak |
| `no-store, private` | a CDN serves the paid result to the next caller for free → demand collapse |

## Multi-instance reality

Memory replay store is per-process; behind a load balancer use `RedisReplayStore`
so a signature claimed on instance A is rejected on instance B. Freshness covers the
gap a memory store can't: after a restart the store is empty, but an old `blockTime`
is still rejected.

## Reseller delivery (markup pattern)

If you resell an upstream paid API: **verify the buyer's payment first, call upstream
second, deliver third.** If upstream fails after you charged, refund or `release` —
never charge for an undelivered upstream. Bind the buyer's payment to the specific
upstream resource so the buyer can't pay for a cheap item and pull an expensive one.
