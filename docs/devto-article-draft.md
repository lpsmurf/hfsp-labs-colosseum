# Charge $0.001 per API call on Solana in 10 lines — the x402 standard

> **TL;DR:** `npm install @hfsp/x402-sdk` then add one line to your Express route. Your API now accepts machine-native USDC payments on Solana.

---

## The problem: there's no standard way to monetize a Solana API

If you build an API today and want to charge per request — from an AI agent, a dApp, or another service — you have two bad options:

1. **API keys + billing system** — you build auth, a payment dashboard, a subscription model. Weeks of work, and AI agents can't use it autonomously.
2. **Roll your own Solana payment check** — write 200 lines to parse token balances, add replay protection, handle edge cases. Every team that wants this rebuilds it from scratch.

There's a better way. The **x402 protocol** turns HTTP's built-in `402 Payment Required` status code into a real payment standard. Your server returns a `402` with payment instructions; the client sends USDC on Solana; the client retries with the transaction signature; the server verifies on-chain and serves the response.

It's HTTP-native. No accounts. No API keys. No billing dashboard. Works for AI agents, scripts, and dApps equally.

The catch: there was no reusable Solana library for it. Until now.

---

## Introducing @hfsp/x402-sdk

We built five production x402 services ([VPN](https://vpn.hfsp.cloud), [VPS](https://vps.hfsp.cloud), [Gnosis Card bridge](https://card.hfsp.cloud), [Circles mini app](https://card.hfsp.cloud/circles/), [OOBE bounty agent](https://github.com/lpsmurf/hfsp-labs-colosseum)) and hit every integration pain point along the way.

`@hfsp/x402-sdk` is what we extracted from those production services and packaged as a reusable library.

```bash
npm install @hfsp/x402-sdk
```

---

## Server side: gate any Express route in one line

```ts
import express from 'express';
import { x402 } from '@hfsp/x402-sdk/server';

const app = express();

app.post('/api/analyze', x402({
  amount:  500_000n,                    // $0.50 USDC (6 decimals)
  payTo:   process.env.OPERATOR_WALLET,
  rpcUrl:  process.env.HELIUS_RPC_URL,
  description: 'AI analysis — $0.50 per request',
}), (req, res) => {
  res.json({
    result: 'your analysis here',
    paidBy: req.solanaPayment?.from,    // the paying wallet
  });
});
```

That's it. Call it without a header and get:

```json
{
  "ok": false,
  "error": "Payment Required",
  "pay": {
    "amount": 500000,
    "amountUsd": "0.500000",
    "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "payTo": "YOUR_WALLET",
    "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
  },
  "instructions": "Send Solana USDC to pay.payTo, then retry with X-Solana-Tx: <signature>"
}
```

Send 0.50 USDC on Solana mainnet, retry with `X-Solana-Tx: <confirmed-sig>`, get your `200`.

---

## Client side: automatic payment for AI agents

The client helper handles the full loop — see the `402`, send USDC, retry — without any manual payment logic:

```ts
import { X402Client } from '@hfsp/x402-sdk/client';
import { Keypair } from '@solana/web3.js';

const client = new X402Client({
  wallet: Keypair.fromSecretKey(secretKey),
  rpcUrl: process.env.HELIUS_RPC_URL,
});

// Looks exactly like fetch — payment happens automatically
const res  = await client.fetch('https://api.example.com/api/analyze', { method: 'POST' });
const data = await res.json();
```

This is what makes x402 powerful for AI agents: the agent can call any x402 API autonomously, negotiate payment on-chain, and get the result — no human in the loop, no API key exchange.

---

## What the SDK handles for you

| Problem | What the SDK does |
|---------|------------------|
| Formatting the 402 challenge correctly | Built into `x402()` |
| Parsing Solana token balance changes | `verifyTx()` walks pre/postTokenBalances |
| Replay attacks (reusing the same signature) | In-memory or Redis store, claimed atomically |
| Client 402 → pay → retry loop | `X402Client.fetch()` |
| Express type augmentation (`req.solanaPayment`) | Included in types |

---

## Replay protection

Default is in-memory — fine for single-instance servers, resets on restart:

```ts
// Default — no configuration needed
x402({ amount: 500_000n, payTo: wallet, rpcUrl })
```

For multi-instance production:

```ts
import { RedisReplayStore } from '@hfsp/x402-sdk/server';
import { Redis } from 'ioredis';

x402({
  amount:      500_000n,
  payTo:       wallet,
  rpcUrl,
  replayStore: new RedisReplayStore(new Redis(process.env.REDIS_URL)),
})
```

---

## Try the live demo

```bash
# Step 1 — see the 402
curl -s -X POST https://demo.hfsp.cloud/api/hello | jq .pay

# Step 3 — after paying $0.001 USDC and getting a signature:
curl -s -X POST https://demo.hfsp.cloud/api/hello \
  -H "X-Solana-Tx: <your-signature>" | jq .
```

Costs $0.001 USDC — cheap enough to test freely.

---

## Amount reference

USDC has 6 decimals. Pass `bigint`:

| USD    | bigint       |
|--------|--------------|
| $0.001 | `1_000n`     |
| $0.10  | `100_000n`   |
| $0.50  | `500_000n`   |
| $1.00  | `1_000_000n` |

---

## Links

- **npm:** `npm install @hfsp/x402-sdk`
- **GitHub:** https://github.com/lpsmurf/hfsp-labs-colosseum/tree/main/packages/x402-sdk
- **Live demo:** https://demo.hfsp.cloud
- **x402 protocol:** https://x402.org

Built by [HFSP Labs](https://hfsp.xyz) — info@hfsp.xyz
