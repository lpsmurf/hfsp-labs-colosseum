# Gnosis Pay Card — Agent & API Reference

Complete reference for autonomous agents and developers integrating the Gnosis Pay x402 top-up API.

---

## Base URL

```
https://api.clawdrop.live
```

All endpoints return `application/json`. Errors follow `{ "error": "message" }`.

---

## Authentication — x402 Protocol

Protected endpoints require an on-chain USDC payment. The flow:

1. Call the endpoint without a payment header → receive `402 Payment Required`
2. Send USDC to the address in the `accepts` array
3. Re-call with `X-Payment: <tx_signature>` header

**402 Response format:**
```json
{
  "x402Version": 1,
  "error": "Payment required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana-mainnet",
      "maxAmountRequired": "1000000",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "payTo": "HvbmYfjCJDBJeXF3BWgb9b6FxEEBRkw2ufg8ThYfLBzy",
      "maxTimeoutSeconds": 300
    },
    {
      "scheme": "exact",
      "network": "base-mainnet",
      "maxAmountRequired": "1000000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "payTo": "0xaC140cD5570c1b91bD57Ddc00b97f1EB6035a8a2",
      "maxTimeoutSeconds": 300
    }
  ]
}
```

**Payment headers:**

| Header | Value |
|--------|-------|
| `X-Payment` | Solana tx signature or EVM tx hash |
| `X-Payment-Chain` | `solana` (default) or `base` |

> Signatures expire after **300 seconds**. Each signature can only be used once.

---

## Endpoints

### `GET /health`

Server health check. No auth.

```json
{ "status": "ok", "uptime": 3600, "version": "0.1.0" }
```

---

### `GET /api/card`

Product overview — available currencies, fees, endpoints. No auth.

---

### `GET /api/card/topup/quote`

Get a live bridge quote. **No payment required.**

**Query params:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `amount` | number | ✓ | — | USDC amount (1–10000) |
| `safeAddress` | string | ✓ | — | Gnosis Safe `0x...` |
| `currency` | string | — | `USDC` | `USDC` \| `EURe` \| `GBPe` |
| `sourceChain` | string | — | `solana` | `solana` \| `base` |

**Example:**
```bash
GET /api/card/topup/quote?amount=50&safeAddress=0x8878...&currency=USDC&sourceChain=solana
```

**Response:**
```json
{
  "ok": true,
  "quote": {
    "youPay": "50 USDC (Solana)",
    "youReceive": "49.31 USDC (Gnosis Chain)",
    "bridgeFee": "$0.18 USDC",
    "serviceFee": "$0.25 USDC (0.5%)",
    "estimatedTime": "~1 min",
    "safeAddress": "0x8878...",
    "dstTokenAddress": "0x2a22f9c3b484c3629090feed35f17ff8f88f76f0"
  },
  "payment": {
    "payTo": "HvbmYfjCJDBJeXF3BWgb9b6FxEEBRkw2ufg8ThYfLBzy",
    "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "network": "solana-mainnet",
    "amount": "50.000000"
  }
}
```

---

### `POST /api/card/topup`

Execute a Safe top-up. **Requires x402 payment.**

**Headers:**
```
X-Payment: <solana-sig or evm-tx-hash>
X-Payment-Chain: solana | base
Content-Type: application/json
```

**Body:**
```json
{
  "amount": 50,
  "safeAddress": "0x8878CC0461242000Ef2C47a6D4EcD3F3A27309b6",
  "currency": "USDC",
  "sourceChain": "solana"
}
```

**Response `202`:**
```json
{
  "ok": true,
  "orderId": "0xfa4068cd...",
  "status": "pending",
  "srcTxHash": "2QANps...",
  "safeAddress": "0x8878...",
  "message": "Bridge order submitted. Funds will arrive in your Safe in ~1-3 minutes.",
  "poll": "/api/card/topup/0xfa4068cd..."
}
```

**Error responses:**

| Code | Meaning |
|------|---------|
| `402` | No payment / underpaid / signature expired |
| `409` | Signature already used |
| `400` | Invalid body |
| `502` | Bridge submission failed |

---

### `GET /api/card/topup/:orderId`

Poll bridge status.

```bash
GET /api/card/topup/0xfa4068cd...
```

```json
{
  "ok": true,
  "orderId": "0xfa4068cd...",
  "status": "fulfilled",
  "srcTxHash": "2QANps...",
  "dstTxHash": "0xe4a21b4f...",
  "message": "Funds arrived in your Safe."
}
```

**Status values:** `pending` → `fulfilled` | `failed`

---

### `GET /api/card/onboard/nonce`

Get a SIWE nonce for wallet authentication.

```bash
GET /api/card/onboard/nonce?wallet=0xYOUR_WALLET
```

```json
{ "ok": true, "nonce": "a8f3c2..." }
```

---

### `POST /api/card/onboard/session`

Exchange a SIWE signature for a session ID.

```json
{
  "walletAddress": "0x...",
  "siweMessage": "...",
  "signature": "0x..."
}
```

```json
{
  "ok": true,
  "sessionId": "uuid",
  "status": "awaiting_terms",
  "message": "Session created. Pay the onboarding fee to activate."
}
```

---

### `POST /api/card/onboard` _(x402)_

Pay the $5 USDC onboarding fee and activate a session.

**Headers:** `X-Payment`, `X-Payment-Chain`

```json
{ "sessionId": "uuid" }
```

**Response:**
```json
{
  "ok": true,
  "sessionId": "uuid",
  "nextSteps": [
    { "step": 1, "action": "Accept terms",  "endpoint": "POST /api/card/onboard/:id/terms" },
    { "step": 2, "action": "Complete KYC",  "endpoint": "GET  /api/card/onboard/:id/kyc" },
    { "step": 3, "action": "Create card",   "endpoint": "POST /api/card/onboard/:id/card" }
  ]
}
```

---

### `GET /api/card/onboard/:id`

Full session status — use to drive a progress UI.

```json
{
  "ok": true,
  "sessionId": "uuid",
  "walletAddress": "0x...",
  "status": "awaiting_kyc",
  "safeAddress": null,
  "cardId": null
}
```

**Status flow:** `awaiting_terms` → `awaiting_kyc` → `awaiting_safe` → `awaiting_card` → `complete`

---

### `POST /api/card/onboard/:id/terms`

Accept Gnosis Pay Terms & Conditions.

```json
{ "ok": true, "status": "awaiting_kyc" }
```

---

### `GET /api/card/onboard/:id/kyc`

Get Sumsub access token for rendering the KYC widget.

```json
{
  "ok": true,
  "kycToken": "eyJ...",
  "kycUrl": "https://in.sumsub.com/idensic",
  "sdk": "@sumsub/websdk-react"
}
```

---

### `POST /api/card/onboard/:id/card`

Create the virtual card after KYC approval and Safe deployment.

```json
{
  "ok": true,
  "status": "complete",
  "cardId": "card_...",
  "safeAddress": "0x...",
  "message": "Virtual card created. Fund your Safe and start spending on 80M+ Visa merchants.",
  "topupEndpoint": "/api/card/topup"
}
```

---

## Agent Integration Pattern

For autonomous agents using this API as a Clawdrop skill:

```typescript
// 1. Get quote
const quote = await fetch('/api/card/topup/quote?amount=50&safeAddress=0x...&currency=USDC&sourceChain=solana');

// 2. Send USDC on Solana to quote.payment.payTo
const sig = await sendUsdcOnSolana(quote.payment.payTo, 50);

// 3. Submit topup
const order = await fetch('/api/card/topup', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Payment': sig,
    'X-Payment-Chain': 'solana',
  },
  body: JSON.stringify({ amount: 50, safeAddress: '0x...', currency: 'USDC', sourceChain: 'solana' }),
});

// 4. Poll until fulfilled
let status = 'pending';
while (status === 'pending') {
  await sleep(5000);
  const res = await fetch(`/api/card/topup/${order.orderId}`);
  status = res.status;
}
```

---

## Constants

```typescript
// Solana
USDC_MINT   = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
RECEIVE_SOL = 'HvbmYfjCJDBJeXF3BWgb9b6FxEEBRkw2ufg8ThYfLBzy'

// Base
USDC_BASE   = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
RECEIVE_EVM = '0xaC140cD5570c1b91bD57Ddc00b97f1EB6035a8a2'

// Gnosis Chain (destination)
USDC_GNOSIS = '0x2a22f9c3b484c3629090feed35f17ff8f88f76f0'  // native Circle USDC
EURe_GNOSIS = '0xcB444e90D8198415266c6a2724b7900fb12FC56E'
GBPe_GNOSIS = '0x5Cb9073902F2035222B9749F8fB0c9BFe5527108'
```

---

## Bridge Architecture

```
User (Solana USDC)
  │
  ├─ x402 payment → our Solana wallet
  │
  └─ Relay.link deposit tx (signed by our wallet)
       │
       └─ Relay.link solver → USDC on Gnosis Chain → user's Safe
```

```
User (Base USDC)
  │
  ├─ x402 payment → our EVM wallet
  │
  └─ Relay.link deposit tx (signed by our EVM wallet)
       │
       └─ Relay.link solver → USDC on Gnosis Chain → user's Safe
```

**Bridge provider:** [Relay.link](https://relay.link) — ~5s settlement, ~$0.03–$0.10 flat fee

---

## Contact & Support

Technical questions or integration support: **info@hfsp.xyz**

---

## Support the Project

If this API powers your product, consider donating — it helps us maintain the infrastructure and keep fees low.

| Chain | Address |
|-------|---------|
| **Solana** | `ALDJCQEjFeSBqd5WbECpYaKcfxfhNvpF4hxrg95x8vRL` |
| **EVM** (ETH, Base, Gnosis, Arbitrum…) | `0x002e76fEdb2014d24AB6032998BD9F406b322bDF` |
| **Bitcoin** | `bc1pt6u3cgad70w5yypdkrdphdfqzmyrvjdljqxpz7r2neday2kjtj9qh4kfyd` |

Built by [HFSP Labs](https://hfsp.xyz) · info@hfsp.xyz
