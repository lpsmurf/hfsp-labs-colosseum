# Clawdrop API Reference

## REST Endpoints

### Trial API (port 8787)

#### GET /api/health
Health check for trial API.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0"
}
```

#### GET /api/quota
Check remaining chat quota for session.

**Response:**
```json
{
  "remaining": 8,
  "limit": 10,
  "reset_at": "2026-05-27T00:00:00Z"
}
```

#### POST /api/chat
Send a message to the trial chatbot.

**Request:**
```json
{
  "message": "What's the price of SOL?",
  "sessionId": "optional-session-id",
  "email": "optional@example.com"
}
```

**Response (SSE stream):**
```
data: {"type": "thinking", "content": "..."}
data: {"type": "response", "content": "The current price of SOL is..."}
data: [DONE]
```

#### POST /api/lead
Save email for conversion funnel.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email saved"
}
```

---

### Clawdrop Platform (port 8788)

#### GET /api/health
Health check for platform.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0"
}
```

#### POST /api/auth/signin
Wallet signature authentication.

**Request:**
```json
{
  "publicKey": "8mAVU6NR8WvZEeUaVb9m1hpHjB5qhm9TZU7qDq4yVYgL",
  "signature": "base64_encoded_signature",
  "message": "Sign this to authenticate"
}
```

**Response:**
```json
{
  "token": "eyJhbGc...",
  "expiresIn": 86400,
  "user": {
    "id": "user-123",
    "wallet": "8mAVU6NR8WvZEeUaVb9m1hpHjB5qhm9TZU7qDq4yVYgL"
  }
}
```

**Authorization:** All subsequent requests require header:
```
Authorization: Bearer <token>
```

#### POST /api/subscriptions
Create a new subscription.

**Request:**
```json
{
  "tier": "pro",
  "agentName": "MyAgent"
}
```

**Response:**
```json
{
  "subscriptionId": "sub-123",
  "status": "active",
  "agentId": "agent-123",
  "tier": "pro",
  "monthlyTokens": 5000000,
  "createdAt": "2026-05-26T12:00:00Z"
}
```

#### GET /api/agents
List all agents owned by authenticated user.

**Response:**
```json
{
  "agents": [
    {
      "id": "agent-123",
      "name": "MyAgent",
      "status": "running",
      "tier": "pro",
      "createdAt": "2026-05-26T12:00:00Z",
      "containerStatus": "healthy"
    }
  ]
}
```

#### POST /api/agent/spawn
Spawn (deploy) an agent container.

**Request:**
```json
{
  "agentId": "agent-123",
  "llmProvider": "openrouter"
}
```

**Response:**
```json
{
  "containerId": "zk-agent-123",
  "mcpServerUrl": "http://localhost:3002",
  "telegramLink": "https://t.me/clawdrop_bot?start=agent-123"
}
```

#### POST /api/vault/store
Store encrypted credentials (AES-GCM).

**Request:**
```json
{
  "agentId": "agent-123",
  "credentialType": "solana_key",
  "encryptedBlob": "base64_encrypted_data"
}
```

**Response:**
```json
{
  "credentialId": "cred-123",
  "stored": true
}
```

#### DELETE /api/vault/revoke
Revoke stored credentials.

**Request:**
```json
{
  "credentialId": "cred-123"
}
```

**Response:**
```json
{
  "revoked": true
}
```

---

## MCP Tools Reference

Each deployed agent's MCP server exposes 70+ tools grouped by source:

### SendAI Agent Kit — TokenPlugin
```
get_token_price             (mint: string) -> { price, change24h, marketCap }
transfer_token              (to: string, mint: string, amount: number)
get_balance                 (address: string, mint?: string) -> number
get_token_data              (mint: string) -> { name, symbol, decimals, ... }
create_token                (decimals: number, initialSupply: number)
update_token_metadata       (mint: string, name: string, symbol: string, uri: string)
get_token_by_mint           (mint: string) -> TokenMetadata
swap_tokens                 (inputMint: string, outputMint: string, amount: number)
```

### SendAI Agent Kit — DefiPlugin
```
swap_tokens_jupiter         (routes: SwapRoute[], slippage: number)
get_liquidity_pools         (token: string) -> Pool[]
get_swap_routes             (inputMint: string, outputMint: string, amount: number)
farm_tokens                 (poolAddress: string, amount: number)
unfarm_tokens               (farmedTokensMint: string, amount: number)
yield_farm                  (farmAddress: string, amount: number)
get_raydium_positions       (wallet: string) -> Position[]
```

### x402engine-mcp
```
payment_initiate            (amount: number, currency: string) -> paymentHash
payment_verify              (paymentHash: string) -> { verified, timestamp }
get_balance                 (wallet: string) -> { balance, currency }
refund_payment              (paymentHash: string, reason: string)
get_transaction_fee         (type: "swap" | "transfer" | "booking") -> number
```

### Clawdrop Custom Tools
```
list_tiers                  () -> Tier[]
get_token_analytics         (mint: string) -> TokenAnalytics
get_wallet_analytics        (wallet: string) -> WalletAnalytics
check_token_risk            (mint: string) -> { riskScore, factors: string[] }
get_market_overview         () -> MarketData
```

---

## Authentication

### Wallet Signature Authentication

Every request to `/api/agent/*` or `/api/vault/*` must include:

1. **Header: X-Wallet-Pubkey**
   ```
   X-Wallet-Pubkey: 8mAVU6NR8WvZEeUaVb9m1hpHjB5qhm9TZU7qDq4yVYgL
   ```

2. **Header: Authorization**
   ```
   Authorization: Bearer <ed25519_signature>
   ```

**Signature generation (JavaScript):**
```javascript
const nacl = require('tweetnacl');
const bs58 = require('bs58');

const privateKeyBuffer = bs58.decode(privateKey);
const messageBuffer = Buffer.from(JSON.stringify({ agentId, timestamp }));
const signature = nacl.sign.detached(messageBuffer, privateKeyBuffer);
const signatureBase64 = Buffer.from(signature).toString('base64');
```

---

## Error Responses

### Standard Error Format
```json
{
  "error": {
    "code": "INSUFFICIENT_BUDGET",
    "message": "Agent does not have sufficient tokens for this operation",
    "details": {
      "required": 10000,
      "available": 5000
    }
  }
}
```

### Common Error Codes
```
UNAUTHORIZED              401  Missing or invalid authorization
FORBIDDEN                 403  User does not own this resource
NOT_FOUND                 404  Resource does not exist
INVALID_SIGNATURE         401  Wallet signature verification failed
INSUFFICIENT_BUDGET       402  Not enough tokens for operation
RATE_LIMITED              429  Too many requests
INVALID_PARAMETER         400  Bad request body
INTERNAL_ERROR            500  Server error
```

---

## Rate Limiting

API rate limits per authenticated user:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/chat` | 10 req | Per day |
| `/api/subscriptions` | 5 req | Per hour |
| `/api/agent/spawn` | 10 req | Per hour |
| `/api/vault/*` | 20 req | Per hour |
| All MCP tools | Unlimited* | Per agent |

*MCP tools are rate-limited by token budget, not by request count.

---

## Example Workflows

### Deploy a New Agent
```bash
# 1. Authenticate
WALLET=8mAVU6NR8WvZEeUaVb9m1hpHjB5qhm9TZU7qDq4yVYgL
SIGNATURE=$(generate_signature)

# 2. Create subscription
curl -X POST http://localhost:8788/api/subscriptions \
  -H "Authorization: Bearer $SIGNATURE" \
  -H "X-Wallet-Pubkey: $WALLET" \
  -H "Content-Type: application/json" \
  -d '{"tier":"pro","agentName":"MyAgent"}'

# 3. Spawn agent
AGENT_ID="agent-123"
curl -X POST http://localhost:8788/api/agent/spawn \
  -H "Authorization: Bearer $SIGNATURE" \
  -H "X-Wallet-Pubkey: $WALLET" \
  -d '{"agentId":"'$AGENT_ID'","llmProvider":"openrouter"}'

# 4. Store encrypted key
curl -X POST http://localhost:8788/api/vault/store \
  -H "Authorization: Bearer $SIGNATURE" \
  -H "X-Wallet-Pubkey: $WALLET" \
  -d '{"agentId":"'$AGENT_ID'","credentialType":"solana_key","encryptedBlob":"..."}'
```

---

**Full documentation:** See [ARCHITECTURE.md](ARCHITECTURE.md) for system design.

