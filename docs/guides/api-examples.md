# Clawdrop API Examples

## Overview

Clawdrop implements the **x402 Payment Protocol** with integrated MemPalace for transaction memory.

- **Base URL**: `http://localhost:3000`
- **Protocol**: HTTP 402 (Payment Required)
- **Fee Models**: Swap (0.35%), Transfer ($0.05 flat), Booking (0.5%)
- **Memory**: Persistent transaction history per wing (swap/transfer/booking)

---

## Getting Started

### 1. Start the API Server

```bash
cd packages/clawdrop-mcp
npm run dev
```

Server runs on `http://localhost:3000` with x402 middleware, payment routes, and MemPalace integration.

### 2. Check Health & Documentation

```bash
# Health check (shows enabled features)
curl http://localhost:3000/health

# API documentation
curl http://localhost:3000/api/docs
```

---

## Transaction Endpoints

### GET /api/quote - Generate Payment Quote

**Purpose**: Get a payment quote without executing a transaction.

```bash
# Quote for tier purchase with SOL
curl "http://localhost:3000/api/quote?wallet_address=9B5X6f51erM7wtcw2TVxhpqUSt5d6NkXMq7QMvs7UhA9&tier_id=pro&amount_sol=1&from_token=SOL"

# Quote for swap from USDC to SOL
curl "http://localhost:3000/api/quote?wallet_address=9B5X6f51erM7wtcw2TVxhpqUSt5d6NkXMq7QMvs7UhA9&amount_sol=1&from_token=USDC"
```

**Response**:
```json
{
  "wallet_address": "9B5X6f51erM7wtcw2TVxhpqUSt5d6NkXMq7QMvs7UhA9",
  "type": "tier_purchase",
  "tier_id": "pro",
  "from_token": "SOL",
  "amount_sol": 1,
  "fee_sol": 0.0035,
  "fee_usd": 0.70,
  "clawdrop_receives": 0.9965,
  "expires_at": "2026-04-18T20:30:45Z",
  "classification": {
    "type": "swap",
    "confidence": 0.95,
    "reasoning": "tier_id indicates tier purchase (swap)"
  }
}
```

---

### POST /api/swap - Execute Token Swap

**Purpose**: Swap tokens and pay for a tier purchase. Executes on Solana and records to MemPalace.

```bash
curl -X POST http://localhost:3000/api/swap \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_address": "9B5X6f51erM7wtcw2TVxhpqUSt5d6NkXMq7QMvs7UhA9",
    "tier_id": "pro",
    "from_token": "USDC",
    "amount_sol": 1,
    "metadata": {
      "campaign": "colosseum-hackathon",
      "source": "web"
    }
  }'
```

**Flow**:
1. x402 middleware classifies as "swap" (tier_id present)
2. Payment service generates Jupiter swap quote
3. Fee collector calculates 0.35% fee
4. MemPalace records transaction start (generates transaction ID)
5. Solana payment executes (if devnet wallet available)
6. Fee collection happens on-chain
7. MemPalace records success with all metadata
8. Response includes transaction ID for tracking

**Response** (success):
```json
{
  "success": true,
  "transaction_id": "6h8k9j.a7b2c3",
  "fee": {
    "amount_sol": 0.0035,
    "amount_usd": 0.70,
    "percentage": "0.35%"
  },
  "quote": {
    "tier_id": "pro",
    "tier_price_sol": 1,
    "payment_token": "USDC",
    "amount_to_send": 1.35,
    "clawdrop_receives": 0.9965
  },
  "metadata": {
    "campaign": "colosseum-hackathon",
    "source": "web",
    "tx_signature": "5k9m2n3o4p5q6r7s8t9u0v1w2x3y4z5",
    "verified": true,
    "fee_collected": true
  }
}
```

---

### POST /api/transfer - Direct SOL Transfer

**Purpose**: Send SOL from one wallet to another. Includes flat $0.05 fee.

```bash
curl -X POST http://localhost:3000/api/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_address": "9B5X6f51erM7wtcw2TVxhpqUSt5d6NkXMq7QMvs7UhA9",
    "destination": "ClawdropPaymentWallet1234567890",
    "amount_sol": 2.5,
    "metadata": {
      "purpose": "agent-deployment"
    }
  }'
```

**Fee Calculation**:
- Transfer fee: $0.05 flat (~0.0002 SOL at $250/SOL)
- No percentage-based fee, just flat amount

**Response**:
```json
{
  "success": true,
  "transaction_id": "6h8k9j.a7b2c3",
  "from": "9B5X6f51erM7wtcw2TVxhpqUSt5d6NkXMq7QMvs7UhA9",
  "to": "ClawdropPaymentWallet1234567890",
  "amount_sol": 2.5,
  "fee": {
    "amount_sol": 0.0002,
    "amount_usd": 0.05,
    "type": "flat"
  },
  "metadata": {
    "purpose": "agent-deployment",
    "tx_signature": "3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8",
    "verified": true,
    "fee_collected": true
  }
}
```

---

### POST /api/booking - Flight/Hotel Booking

**Purpose**: Record booking payment with 0.5% fee.

```bash
curl -X POST http://localhost:3000/api/booking \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_address": "9B5X6f51erM7wtcw2TVxhpqUSt5d6NkXMq7QMvs7UhA9",
    "booking_type": "flight",
    "booking_value_usd": 850,
    "metadata": {
      "airline": "United",
      "origin": "SFO",
      "destination": "NYC",
      "date": "2026-05-15"
    }
  }'
```

**Fee Calculation**:
- Booking fee: 0.5% of $850 = $4.25
- In SOL: $4.25 / $250 = 0.017 SOL

**Response**:
```json
{
  "success": true,
  "transaction_id": "6h8k9j.a7b2c3",
  "booking_type": "flight",
  "booking_value_usd": 850,
  "fee": {
    "amount_sol": 0.017,
    "amount_usd": 4.25,
    "percentage": "0.5%"
  },
  "metadata": {
    "airline": "United",
    "origin": "SFO",
    "destination": "NYC",
    "date": "2026-05-15",
    "fee_collected": true
  }
}
```

---

## Memory & History Endpoints

### GET /api/history/:wing - Retrieve Transaction History

**Purpose**: Get all transactions for a specific wing (swap/transfer/booking).

```bash
# Get all swaps
curl http://localhost:3000/api/history/swap

# Get all transfers
curl http://localhost:3000/api/history/transfer

# Get all bookings
curl http://localhost:3000/api/history/booking

# Paginated (optional)
curl "http://localhost:3000/api/history/swap?page=1&limit=20"
```

**Response**:
```json
{
  "wing": "swap",
  "count": 5,
  "transactions": [
    {
      "transaction_id": "6h8k9j.a7b2c3",
      "type": "swap",
      "wallet": "9B5X6f51erM7wtcw2TVxhpqUSt5d6NkXMq7QMvs7UhA9",
      "fee_sol": 0.0035,
      "fee_usd": 0.70,
      "timestamp": "2026-04-18T15:30:45Z",
      "status": "confirmed",
      "metadata": { "tier_id": "pro" }
    },
    {
      "transaction_id": "7i9l0m.b8c3d4",
      "type": "swap",
      "wallet": "9B5X6f51erM7wtcw2TVxhpqUSt5d6NkXMq7QMvs7UhA9",
      "fee_sol": 0.0042,
      "fee_usd": 0.84,
      "timestamp": "2026-04-17T10:15:22Z",
      "status": "confirmed",
      "metadata": { "tier_id": "enterprise" }
    }
  ],
  "page": 1,
  "limit": 50
}
```

---

### GET /api/search - Search Transaction History

**Purpose**: Search transactions across all wings by keyword.

```bash
# Search by transaction ID
curl "http://localhost:3000/api/search?keyword=6h8k9j"

# Search by wallet address
curl "http://localhost:3000/api/search?keyword=9B5X6f51erM7wtcw2TVxhpqUSt5d6NkXMq7QMvs7UhA9"

# Search by tier name
curl "http://localhost:3000/api/search?keyword=pro"

# Filter results to specific wing
curl "http://localhost:3000/api/search?keyword=pro&wing=swap"

# Search by metadata (e.g., campaign)
curl "http://localhost:3000/api/search?keyword=colosseum-hackathon"
```

**Response**:
```json
{
  "keyword": "pro",
  "wing": "swap",
  "count": 3,
  "transactions": [
    {
      "transaction_id": "6h8k9j.a7b2c3",
      "type": "swap",
      "tier_id": "pro",
      "fee_sol": 0.0035,
      "timestamp": "2026-04-18T15:30:45Z",
      "status": "confirmed"
    },
    {
      "transaction_id": "2c3d4e.f5g6h7",
      "type": "swap",
      "tier_id": "pro",
      "fee_sol": 0.0040,
      "timestamp": "2026-04-16T09:20:10Z",
      "status": "confirmed"
    },
    {
      "transaction_id": "8i9j0k.l1m2n3",
      "type": "swap",
      "tier_id": "pro",
      "fee_sol": 0.0038,
      "timestamp": "2026-04-15T14:45:55Z",
      "status": "confirmed"
    }
  ]
}
```

---

### GET /api/stats - Transaction Statistics

**Purpose**: Get aggregate statistics about transaction memory.

```bash
curl http://localhost:3000/api/stats
```

**Response**:
```json
{
  "timestamp": "2026-04-18T20:35:12Z",
  "stats": {
    "total_transactions": 12,
    "by_wing": {
      "swap": {
        "count": 5,
        "total_fee_sol": 0.0185,
        "total_fee_usd": 4.63
      },
      "transfer": {
        "count": 4,
        "total_fee_sol": 0.0008,
        "total_fee_usd": 0.20
      },
      "booking": {
        "count": 3,
        "total_fee_sol": 0.0612,
        "total_fee_usd": 15.30
      }
    },
    "total_fees_collected_sol": 0.0805,
    "total_fees_collected_usd": 20.13,
    "mempalace_healthy": true,
    "last_transaction": "2026-04-18T15:30:45Z"
  }
}
```

---

## Error Responses

### 402 Payment Required (x402 Signature)

When a payment requirement is detected:

```json
{
  "error": "[HFSP_X402_PAYMENT_REQUIRED] Payment required for this transaction",
  "fee": {
    "amount_sol": 0.0035,
    "amount_usd": 0.70
  },
  "quote_id": "quote_abc123",
  "expires_at": "2026-04-18T20:30:45Z"
}
```

### Invalid Wallet

```json
{
  "error": "[PAYMENT_INVALID_WALLET] Invalid wallet address",
  "details": "Must be a valid Solana public key (32-34 base58 chars)"
}
```

### Transaction Verification Failed

```json
{
  "error": "[PAYMENT_EXECUTION_ERROR] Payment failed",
  "details": "Payment verification failed",
  "tx_id": "6h8k9j.a7b2c3"
}
```

---

## Code Signatures & Audit Trail

Every request generates custom error signatures for traceability:

- `[HFSP_X402_*]` - x402 protocol events
- `[PAYMENT_*]` - Payment execution
- `[FEE_*]` - Fee collection
- `[MEMPALACE_*]` - Memory operations
- `[WING_*]` - Multi-wing routing
- `[TX_API_*]` - Transaction API events
- `[SWAP_*]`, `[TRANSFER_*]`, `[BOOKING_*]` - Transaction type events

Check server logs for full audit trail:

```bash
npm run logs  # View transaction logs with all signatures
```

---

## Testing the Full Flow

```bash
#!/bin/bash

# 1. Check API is running
curl http://localhost:3000/health

# 2. Get a quote first
QUOTE=$(curl -s "http://localhost:3000/api/quote?wallet_address=9B5X6f51erM7wtcw2TVxhpqUSt5d6NkXMq7QMvs7UhA9&tier_id=pro&amount_sol=1")
echo "Quote: $QUOTE"

# 3. Execute swap (will generate transaction ID)
SWAP=$(curl -s -X POST http://localhost:3000/api/swap \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_address": "9B5X6f51erM7wtcw2TVxhpqUSt5d6NkXMq7QMvs7UhA9",
    "tier_id": "pro",
    "from_token": "SOL",
    "amount_sol": 1
  }')
echo "Swap: $SWAP"

# 4. Extract transaction ID
TX_ID=$(echo $SWAP | jq -r '.transaction_id')
echo "Transaction ID: $TX_ID"

# 5. Search for transaction by ID
curl "http://localhost:3000/api/search?keyword=$TX_ID"

# 6. Get swap history
curl http://localhost:3000/api/history/swap

# 7. Get stats
curl http://localhost:3000/api/stats
```

---

## Integration Architecture

```
┌─────────────────┐
│ HTTP Request    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ Express Middleware      │
│ - JSON parsing          │
│ - CORS headers          │
│ - Request logging       │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ x402 Middleware         │ ← Classifies transaction type
│ - Classify transaction  │   (swap/transfer/booking)
│ - Check payment needed  │
│ - Attach metadata       │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Payment Middleware      │ ← Orchestrates payment flow
│ - Generate quote        │
│ - Record transaction    │
│ - Execute payment       │
│ - Collect fees          │
│ - Record success        │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Transaction Route       │ ← Route-specific logic
│ (/swap, /transfer, etc) │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Response                │
│ - Transaction ID        │
│ - Fee info              │
│ - Metadata              │
└─────────────────────────┘
```

---

## Production Considerations

1. **Wallet Signing**: Replace devnet mock with actual Solana wallet signing
2. **MemPalace Server**: Ensure MemPalace Flask server runs on `http://localhost:8888`
3. **Database**: Replace in-memory fee logs with production database
4. **Rate Limiting**: Add rate limiting middleware for DOS protection
5. **Authentication**: Implement wallet signature verification for requests
6. **Monitoring**: Set up alerts for failed fee collection or payment verification

---

## Support

- Documentation: `http://localhost:3000/api/docs`
- Health Check: `http://localhost:3000/health`
- Code Signatures: Check logs for `[HFSP_X402_*]` patterns
- GitHub: https://github.com/hfsp-labs/hfsp-labs-colosseum
