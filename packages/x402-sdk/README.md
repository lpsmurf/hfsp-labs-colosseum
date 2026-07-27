# @hfsp/x402-sdk

Node.js middleware for Solana x402 payments. Add machine-native payment gating to any Express API in under 10 lines of code.

No custom Solana code required. Works with any Solana RPC (Helius recommended).

---

## Install

```bash
npm install @hfsp/x402-sdk
```

---

## Server — gate any route in one line

```ts
import express from 'express';
import { x402 } from '@hfsp/x402-sdk/server';

const app = express();

const gate = x402({
  amount:      500_000n,                  // $0.50 USDC (6 decimals)
  payTo:       process.env.OPERATOR_WALLET,
  rpcUrl:      process.env.HELIUS_RPC_URL,
  description: 'AI analysis — $0.50 per request',
});

app.post('/api/analyze', gate, (req, res) => {
  res.json({ result: 'done', paidBy: req.solanaPayment?.from });
});
```

Client flow:
1. Call endpoint without headers → `402` + payment instructions
2. Send USDC on Solana mainnet to `payTo`
3. Retry with `X-Solana-Tx: <confirmed-sig>` → `200`

---

## Client — automatic 402 handling for AI agents

```ts
import { X402Client } from '@hfsp/x402-sdk/client';
import { Keypair } from '@solana/web3.js';

const client = new X402Client({
  wallet: Keypair.fromSecretKey(secretKey),
  rpcUrl: process.env.HELIUS_RPC_URL,
});

// Pays $0.50 USDC automatically when server returns 402
const res  = await client.fetch('https://api.example.com/api/analyze', {
  method: 'POST',
  body:   JSON.stringify({ input: 'hello' }),
});
const data = await res.json();
```

---

## Replay protection

Default: in-memory store (sufficient for single-instance deployments, lost on restart).

For multi-instance or persistent replay protection, pass a Redis store:

```ts
import { RedisReplayStore } from '@hfsp/x402-sdk/server';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

const gate = x402({
  amount:       500_000n,
  payTo:        process.env.OPERATOR_WALLET,
  rpcUrl:       process.env.HELIUS_RPC_URL,
  replayStore:  new RedisReplayStore(redis),
});
```

---

## Hardening: freshness + resource binding

Replay protection alone is necessary but not sufficient. Two further x402
invariants — formalized in the 2026 literature (arXiv:2605.30998 §4.2/4.3,
arXiv:2605.11781) — are enforced here:

- **Freshness window** (default **300 s**, on by default). A payment whose
  on-chain `blockTime` is older than the window is rejected, so a stale
  signature can't be redeemed after an instance restart clears the replay store.
  Tune or disable per route:

  ```ts
  x402({ amount: 500_000n, payTo, rpcUrl, maxAgeSeconds: 120 }); // 0 disables
  ```

- **Resource binding** (opt-in). Without it, a payment to `payTo` for amount *X*
  unlocks **any** route of the same price ("pay A, get B"). Set `resourceId` and
  the seller requires an SPL-Memo equal to it; the `@hfsp` client attaches the
  memo automatically when the challenge advertises it:

  ```ts
  app.post('/api/analyze', x402({
    amount: 500_000n, payTo, rpcUrl,
    resourceId: '/api/analyze',   // payment must carry this memo
  }), handler);
  ```

Paid responses are also served `Cache-Control: no-store, private` so a proxy or
CDN can't leak a paid result to an unpaid caller (handlers may override).

---

## Payment amounts

USDC has 6 decimals. Amounts are `bigint` in atomic units:

| USD    | Atomic units  |
|--------|---------------|
| $0.001 | `1_000n`      |
| $0.10  | `100_000n`    |
| $0.50  | `500_000n`    |
| $1.00  | `1_000_000n`  |

---

## Networks

Default: Solana mainnet. For devnet (testing):

```ts
import { SOLANA_DEVNET, USDC_DEVNET } from '@hfsp/x402-sdk';

const gate = x402({
  amount:  100n,
  payTo:   'YOUR_WALLET',
  rpcUrl:  'https://api.devnet.solana.com',
  mint:    USDC_DEVNET,
  network: SOLANA_DEVNET,
});
```

---

## Low-level verify

For custom payment flows (webhooks, non-Express frameworks):

```ts
import { verifyTx } from '@hfsp/x402-sdk/server';

const result = await verifyTx(rpcUrl, txSig, usdcMint, expectedRecipient, 500_000n);
if (result.ok) {
  console.log(`Paid ${result.amount} atomic USDC from ${result.from}`);
}
```

---

## How it works

The server middleware implements the x402 protocol (HTTP 402 standard):

1. **Challenge**: on first request, returns `402` with a `PAYMENT-REQUIRED` header (base64 JSON) and a human-readable body describing what to pay, to whom, and on which network.
2. **Verification**: on retry with `X-Solana-Tx`, parses the transaction via `getTransaction` (jsonParsed), walks `preTokenBalances`/`postTokenBalances` to confirm a USDC transfer ≥ `amount` landed at `payTo`.
3. **Replay protection**: the tx signature is claimed atomically before RPC verification. A second request with the same signature is rejected immediately.

---

## Proof of work

Five production x402 services built with this pattern:
- `vpn.hfsp.cloud` — WireGuard VPN on Solana + Base
- `vps.hfsp.cloud` — Ephemeral VPS on Solana + Base
- `card.hfsp.cloud` — Gnosis Card x402 bridge
- `card.hfsp.cloud/circles/` — Gnosis Circles Garage mini app
- OOBE bounty — autonomous x402 agent on Solana mainnet

---

## License

Apache 2.0 — HFSP Labs <info@hfsp.xyz>
