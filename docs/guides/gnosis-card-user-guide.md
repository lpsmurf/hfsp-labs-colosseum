# Gnosis Pay Card — User Guide

Top up your Gnosis Pay Safe with USDC from Solana or Base. No accounts, no KYC for top-ups — just send crypto and receive stablecoins in your card wallet in ~90 seconds.

---

## What is this?

Gnosis Pay gives you a self-custodial Visa debit card linked to a [Gnosis Safe](https://safe.global). You control the keys, the card spends directly from your Safe.

This service lets you fund that Safe using **Solana USDC or Base USDC** via the [x402 payment protocol](https://x402.org) — no bridges to navigate manually, no wrapping, no approvals.

---

## Supported Chains & Tokens

| Source | Token | Address |
|--------|-------|---------|
| **Solana** | USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| **Base** | USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

| Destination | Token | Address |
|-------------|-------|---------|
| **Gnosis Chain** | USDC (native Circle) | `0x2a22f9c3b484c3629090feed35f17ff8f88f76f0` |
| **Gnosis Chain** | EURe | `0xcB444e90D8198415266c6a2724b7900fb12FC56E` |
| **Gnosis Chain** | GBPe | `0x5Cb9073902F2035222B9749F8fB0c9BFe5527108` |

---

## Step 1 — Get a Quote

Before sending anything, check the current fees and expected amount:

```bash
curl "https://api.clawdrop.live/api/card/topup/quote?amount=100&safeAddress=0xYOUR_SAFE&currency=USDC&sourceChain=solana"
```

**Response:**
```json
{
  "ok": true,
  "quote": {
    "youPay": "100 USDC (Solana)",
    "youReceive": "98.72 USDC (Gnosis Chain)",
    "bridgeFee": "$0.93 USDC",
    "serviceFee": "$0.50 USDC (0.5%)",
    "estimatedTime": "~1 min"
  },
  "payment": {
    "payTo": "HvbmYfjCJDBJeXF3BWgb9b6FxEEBRkw2ufg8ThYfLBzy",
    "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "network": "solana-mainnet",
    "amount": "100.000000"
  }
}
```

**Parameters:**

| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `amount` | ✓ | — | USDC amount ($1–$10,000) |
| `safeAddress` | ✓ | — | Your Gnosis Safe `0x...` address |
| `currency` | — | `USDC` | Destination token: `USDC`, `EURe`, `GBPe` |
| `sourceChain` | — | `solana` | Source chain: `solana` or `base` |

---

## Step 2 — Send Payment

Send the exact USDC amount shown in `payment.amount` to `payment.payTo`.

### From Solana
Send USDC to: `HvbmYfjCJDBJeXF3BWgb9b6FxEEBRkw2ufg8ThYfLBzy`

### From Base
Send USDC to: `0xaC140cD5570c1b91bD57Ddc00b97f1EB6035a8a2`

> The payment must be in a **single transaction**. Keep the transaction signature — you'll need it in step 3.

---

## Step 3 — Submit Top-Up

After your payment confirms on-chain, submit the bridge request:

```bash
curl -X POST "https://api.clawdrop.live/api/card/topup" \
  -H "Content-Type: application/json" \
  -H "X-Payment: <YOUR_TX_SIGNATURE>" \
  -H "X-Payment-Chain: solana" \
  -d '{
    "amount": 100,
    "safeAddress": "0xYOUR_SAFE",
    "currency": "USDC",
    "sourceChain": "solana"
  }'
```

**Response:**
```json
{
  "ok": true,
  "orderId": "0xfa4068...",
  "status": "pending",
  "message": "Bridge order submitted. Funds will arrive in your Safe in ~1-3 minutes.",
  "poll": "/api/card/topup/0xfa4068..."
}
```

> Set `X-Payment-Chain: base` if you paid from Base.

---

## Step 4 — Check Status

Poll the status endpoint until `status` is `fulfilled`:

```bash
curl "https://api.clawdrop.live/api/card/topup/0xfa4068..."
```

```json
{
  "ok": true,
  "status": "fulfilled",
  "dstTxHash": "0xe4a21b4f..."
}
```

| Status | Meaning |
|--------|---------|
| `pending` | Bridge in progress (~30–90s) |
| `fulfilled` | USDC arrived in your Safe |
| `failed` | Bridge failed — contact support |

---

## Fees

| Fee | Amount |
|-----|--------|
| Service fee | 0.5% of amount |
| Relay.link bridge fee | ~$0.03–$0.10 (flat, varies by amount) |

**Break-even**: fees drop below 1.5% total at ~$10+. For small amounts, fees are proportionally higher.

---

## Managed Onboarding (New Card)

If you don't have a Gnosis Pay card yet, we offer managed onboarding:

1. **Authenticate** — sign a [SIWE](https://eips.ethereum.org/EIPS/eip-4361) message with your EVM wallet
2. **Pay setup fee** — $5 USDC (via x402)
3. **Complete KYC** — identity verification via Sumsub
4. **Safe deployed** — your Gnosis Safe is created on Gnosis Chain
5. **Card issued** — virtual Visa card linked to your Safe

```bash
# Step 1 — Get nonce
GET /api/card/onboard/nonce?wallet=0xYOUR_WALLET

# Step 2 — Create session (after signing)
POST /api/card/onboard/session
{ "walletAddress": "0x...", "siweMessage": "...", "signature": "0x..." }

# Step 3 — Pay onboarding fee (x402)
POST /api/card/onboard
X-Payment: <solana-tx-sig>
{ "sessionId": "uuid" }
```

---

## FAQ

**My payment was sent but I got "Signature already used"**
Each transaction signature can only be used once. If you see this error, the payment was already processed. Check your Safe balance on [GnosisScan](https://gnosisscan.io).

**How long does it take?**
Typically 30–90 seconds. Solana confirms in ~1s, Relay.link settles on Gnosis in ~5–60s.

**What if the bridge fails?**
Relay.link automatically refunds to your source wallet within a few minutes.

**Minimum amount?**
$1 USDC minimum. Below $10 the fees are proportionally high (~8–15%).
