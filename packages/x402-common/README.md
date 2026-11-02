# @hfsp/x402-common

Shared building blocks for x402 **V2** payment gates. Every HFSP service that sells
something over x402 should build its gate from here.

Spec: https://github.com/x402-foundation/x402

## Why this package exists

An audit in July 2026 found that 6 of our 7 x402 revenue services could not be paid
by any standard `@x402/*` client. Two root causes, both avoidable:

1. **V1 wire format** — `X-PAYMENT` instead of `PAYMENT-SIGNATURE`, JSON-body
   challenges instead of the `PAYMENT-REQUIRED` header, `"base-mainnet"` instead of
   `eip155:8453`.
2. **The wrong payment model** — we asked clients to broadcast a transaction and
   hand us the hash. In x402 the client signs an *authorization* and the server
   submits it. A standard client never broadcasts anything, so there is no hash to
   look up and no way for the payment to succeed.

Both are structural, not typos. This package makes the correct thing the easy thing.

## Usage

```ts
import { createResourceServer, gate, buildGate, FACILITATORS } from "@hfsp/x402-common";

const server = createResourceServer({
  facilitatorUrl: process.env.FACILITATOR_URL ?? FACILITATORS.dexter,
  families: ["evm"],
  networks: ["base"],
});

const routes = {
  "POST /audit": gate({
    price: 0.99,
    payTo: process.env.OPERATOR_BASE_ADDRESS!,
    network: "base",
    description: "x402 security audit of a repository",
  }),
};

app.use(buildGate(routes, server));
```

Accepting more than one chain on the same endpoint:

```ts
import { multiGate } from "@hfsp/x402-common";

const routes = {
  "POST /audit": multiGate("x402 security audit", [
    { price: 0.99, payTo: BASE_ADDR,   network: "base",   description: "" },
    { price: 0.99, payTo: SOLANA_ADDR, network: "solana", description: "" },
  ]),
};
```

## Facilitators

`FACILITATORS` lists the ones we've verified. **`x402.org` is testnet only** — the
spec docs say plainly it is "not intended to be the default production choice for
mainnet routes". `createResourceServer` throws at construction if you pair it with a
mainnet network, because the failure mode otherwise is payments that look accepted
and never settle.

Production options supporting both EVM and Solana mainnet: `dexter` (free, no
account), `corbits`, `payai`, `solvador`.

## Pricing

Use `gate({ price: 0.99 })` — dollars in, USDC atomic units out via `usdc()`.

Avoid the `"$0.99"` price-string form the SDK also accepts: it resolves through the
chain's configured default stablecoin, which only exists on some chains and fails
silently elsewhere. An explicit `{ asset, amount }` works on every chain.

## The `legacy` helpers

`buildChallenge`, `send402`, `attachReceipt` and `readProof` exist for services that
still settle through a custom verifier. They put the **V2 wire format** on a custom
flow, so standard clients can at least discover and parse the service:

```ts
import { buildChallenge, send402, readProof, attachReceipt } from "@hfsp/x402-common";

const proof = readProof(req.headers, "X-Payment");   // V2 header wins over legacy
if (!proof) return send402(res, buildChallenge({ ... }));
```

This is a bridge, not a destination. Anything using these should migrate to
`createResourceServer` once its network has a facilitator path.

## Tests

```bash
npm test -w @hfsp/x402-common
```
