---
name: x402-sdk-demo
title: "@hfsp/x402-sdk — Live Demo"
description: "Live demo for @hfsp/x402-sdk — the Node.js middleware for Solana x402 payments. Try the full 402 → pay → 200 flow for $0.001 USDC."
use_case: "Use to test x402 client implementations, demonstrate Solana USDC payment flows, and verify your X402Client integration against a real payment-gated server."
category: developer-tools
service_url: https://demo.hfsp.cloud
openapi:
  path: openapi.json
---

Live demo of `@hfsp/x402-sdk`. Calls cost $0.001–$0.005 USDC on Solana mainnet — cheap
enough to test freely.

**Install the SDK:** `npm install @hfsp/x402-sdk`

## Endpoints

| Path | Price | Response |
|------|-------|----------|
| `POST /api/hello` | $0.001 USDC | Greeting + your wallet address + tx sig |
| `POST /api/timestamp` | $0.001 USDC | Server timestamp |
| `POST /api/echo` | $0.005 USDC | Echoes your request body |

## Payment flow

```text
POST /api/hello
→ 402  { pay: { amount: 1000, mint: "EPjFWdd5...", payTo: "GdAWRcvr..." } }
→ (send 0.001 USDC on Solana mainnet)
→ POST /api/hello  X-Solana-Tx: <confirmed-signature>
→ 200  { message: "Hello!", paidBy: "yourWallet...", txSig: "..." }
```

## Using X402Client (automatic)

```ts
import { X402Client } from '@hfsp/x402-sdk/client';
import { Keypair } from '@solana/web3.js';

const client = new X402Client({
  wallet: Keypair.fromSecretKey(secretKey),
  rpcUrl: process.env.HELIUS_RPC_URL,
});

const res  = await client.fetch('https://demo.hfsp.cloud/api/hello', { method: 'POST' });
const data = await res.json();
// { ok: true, message: "Hello!", paidBy: "...", txSig: "..." }
```

## Manual curl flow

```bash
# Step 1 — get payment instructions
curl -s -X POST https://demo.hfsp.cloud/api/hello | jq .pay

# Step 2 — send 0.001 USDC on Solana mainnet, get <signature>

# Step 3 — retry with signature
curl -s -X POST https://demo.hfsp.cloud/api/hello \
  -H "X-Solana-Tx: <signature>" | jq .
```

## Payment details

- **Network:** Solana mainnet (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`)
- **Asset:** USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, 6 decimals)
- **Header:** `X-Solana-Tx: <confirmed transaction signature>`
- **Replay protection:** each tx signature is single-use
