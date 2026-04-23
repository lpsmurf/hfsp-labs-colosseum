# Colosseum SDK Patterns & Client Libraries

**Metadata**: SDK patterns, client libraries, service contracts, type definitions  
**Activation Triggers**: "message handling", "API integration", "request/response", "client library", "imports", "types", "Express server", "HTTP endpoint", "Telegram types", "webhook", "payment protocol", "x402", "MemPalace", "wings model"  
**Token Cost**: ~70 tokens (metadata only), ~250 tokens (full content)

---

## 1. Express Server Setup Pattern

All Colosseum services (agent-brain, telegram-bot, clawdrop-mcp) follow this Express pattern:

```typescript
import express, { Request, Response } from "express";
import { createLogger } from "./utils/logger.js";

const logger = createLogger();
const app = express();
const port = parseInt(process.env.PORT || "3335", 10);

// Middleware
app.use(express.json());

// Health check endpoint (all services must have this)
app.get("/health", (req: Request, res: Response) => {
  logger.debug("Health check requested");
  res.status(200).json({
    status: "healthy",
    service: "service-name",
    timestamp: new Date().toISOString(),
  });
});

// Your endpoints go here
app.post("/message", async (req: Request, res: Response) => {
  try {
    // Handle request
    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error({ error }, "Error processing request");
    res.status(200).json({ ok: true }); // Always return 200 to caller
  }
});

// Graceful shutdown handlers
const server = app.listen(port, () => {
  logger.info({ port }, "Service started");
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});
```

**Key Pattern**: Always return 200 to external callers (Telegram, webhooks) even on internal errors. Log fully for diagnostics. Use structured logging with pino.

**Logger Setup** (utils/logger.ts):
```typescript
import pino from "pino";

export function createLogger() {
  const level = process.env.LOG_LEVEL || (process.env.DEBUG === "true" ? "debug" : "info");
  return pino({
    level,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
```

---

## 2. Service Contracts

### Agent Brain: POST /message

**Request Contract**:
```json
{
  "user_id": "string (required)",
  "chat_id": "string (required)",
  "text": "string (required, message content)",
  "message_id": "number (required, unique identifier)"
}
```

**Response Contract**:
```json
{
  "status": "ok",
  "user_id": "string (echoed from request)",
  "chat_id": "string (echoed from request)",
  "message_id": "number (echoed from request)",
  "response": "string (agent's response to message)",
  "timestamp": "ISO-8601 string"
}
```

**Example Usage**:
```bash
curl -X POST http://localhost:3334/message \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "chat_id": "chat_456",
    "text": "Hello agent",
    "message_id": 1
  }'
```

### Telegram Bot: POST /webhook

**Request Contract** (Telegram's TelegramUpdate):
```json
{
  "update_id": 123456789,
  "message": {
    "message_id": 1,
    "date": 1234567890,
    "chat": {
      "id": 987654321,
      "type": "private"
    },
    "from": {
      "id": 111222333,
      "is_bot": false,
      "first_name": "User"
    },
    "text": "User message"
  }
}
```

**Required Header**:
```
X-Telegram-Bot-Api-Secret-Token: <your-secret-token>
```

**Response Contract**:
```json
{
  "ok": true
}
```

**Always return 200** even on error to prevent Telegram retries.

### x402 Payment Endpoints

**GET /api/quote** - Get pricing for operation
```json
// Request
{ "operation": "swap" | "transfer" | "booking", "amount": 1000 }

// Response
{
  "base_fee": 50,
  "percentage_fee": 25,
  "total_fee": 75,
  "net_amount": 925,
  "currency": "USDC"
}
```

**POST /api/swap** - Execute token swap
```json
// Request
{ "from_token": "USDC", "to_token": "SOL", "amount": 1000 }

// Response
{
  "transaction_id": "tx_abc123",
  "status": "success",
  "output_amount": 2.5,
  "fee_paid": 75
}
```

---

## 3. Telegram Types & Webhook Structure

**Type Definitions**:
```typescript
interface TelegramMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  from?: { id: number; is_bot: boolean; first_name?: string; username?: string };
  text?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: { id: number; is_bot: boolean; first_name?: string };
  chat_instance: string;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}
```

**Signature Validation Pattern**:
```typescript
import crypto from "crypto";

function validateSignature(secretToken: string, req: any): boolean {
  const headerToken = req.headers["x-telegram-bot-api-secret-token"];
  
  if (!headerToken) {
    logger.warn("Missing X-Telegram-Bot-Api-Secret-Token header");
    return false;
  }
  
  // Signature is simple string comparison
  return headerToken === secretToken;
}
```

**Critical Rule**: Telegram requires a `200` response to webhook calls, even on error. This prevents Telegram from retrying with exponential backoff.

---

## 4. Type Definitions Best Practices

**Use Zod for Runtime Validation**:
```typescript
import { z } from "zod";

const MessageSchema = z.object({
  user_id: z.string().min(1),
  chat_id: z.string().min(1),
  text: z.string().min(1),
  message_id: z.number().positive(),
});

type Message = z.infer<typeof MessageSchema>;

// In handler
const parsed = MessageSchema.parse(req.body);
```

**Avoid enums in TypeScript services** (they require runtime overhead). Use literal unions instead:
```typescript
// Bad
enum Operation {
  SWAP = "swap",
  TRANSFER = "transfer",
  BOOKING = "booking"
}

// Good
type Operation = "swap" | "transfer" | "booking";
```

**Use strict TypeScript mode** (`tsconfig.json`):
```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

---

## 5. x402 Payment Protocol

The x402 protocol classifies transactions into 3 "wings" (parallel execution paths):

**Intent Classification** (happens on every /api/* request):
```typescript
// User intent: "Swap 1000 USDC for SOL"
// Classification: "swap" wing
// Fee: base (50) + percentage (25 on 1000) = 75 total

const classify = (text: string): "swap" | "transfer" | "booking" => {
  if (text.includes("swap") || text.includes("exchange")) return "swap";
  if (text.includes("send") || text.includes("transfer")) return "transfer";
  if (text.includes("book") || text.includes("reserve")) return "booking";
  throw new Error("Cannot classify intent");
};
```

**Fee Model**:
```
Fee = base_fee + (amount * percentage_rate)
```

Fees are collected and stored in MemPalace for auditability.

**Wings Model** (Transaction Routing):
- **SWAP Wing**: Token exchange operations (DEX integration)
- **TRANSFER Wing**: Movement of tokens between accounts
- **BOOKING Wing**: Resource reservation and ticketing

Each wing has different validation rules and async paths.

---

## 6. MemPalace Integration

MemPalace is Colosseum's memory system for storing transaction history and agent knowledge:

```typescript
import { MemPalace } from "./integrations/mempalace.js";

const memory = new MemPalace();

// Store transaction
await memory.recordTransaction({
  id: "tx_123",
  operation: "swap",
  amount: 1000,
  fee: 75,
  user_id: "user_456",
  timestamp: Date.now(),
  status: "completed"
});

// Query history
const history = await memory.getTransactionHistory("user_456");

// Store conversation context
await memory.recordConversation({
  user_id: "user_456",
  message: "What's my balance?",
  response: "Your balance is 500 USDC",
  timestamp: Date.now()
});
```

**Knowledge Graph Storage** (from Python stdlib):
Colosseum uses Python's `collections` stdlib for persistent conversation memory. This enables:
- Multi-turn conversation context
- User preference memory
- Transaction pattern analysis

---

## 7. Deployment Self-Manifest

Services in Colosseum expose their capabilities via a self-manifest (for agent discovery):

```json
{
  "name": "agent-brain",
  "version": "1.0.0",
  "capabilities": [
    "message_processing",
    "rag_query",
    "agent_orchestration"
  ],
  "endpoints": {
    "/health": "GET",
    "/message": "POST",
    "/metadata": "GET"
  },
  "models": [
    {
      "id": "gpt-4o",
      "capabilities": ["chat", "vision"],
      "cost_per_1k_tokens": 0.01
    },
    {
      "id": "text-embedding-3-small",
      "capabilities": ["embeddings"],
      "cost_per_1k_tokens": 0.00002
    }
  ],
  "wallet": {
    "provider": "solana",
    "address": "agent_wallet_123",
    "tiers": ["basic", "pro", "enterprise"]
  }
}
```

**Wallet Configuration Options**:
- **Turnkey**: Use Turnkey's custodial service (recommended for development)
- **Crossmint**: Use Crossmint for multi-chain support
- **Direct Solana**: Self-hosted validator connection

---

## Cross-Service Integration Points

When building features that span services:

1. **Telegram Bot → Agent Brain**: Send `/message` requests with proper structure
2. **Agent Brain → Clawdrop MCP**: Call `/api/quote` and `/api/swap` for payments
3. **All Services → MemPalace**: Record every transaction and conversation
4. **All Services → Logger**: Use structured pino logging with context

See `docs/guides/system-flow.md` for end-to-end flow diagram.

---

## Source References

- Agent Brain implementation: `packages/agent-provisioning/services/agent-brain/src/index.ts`
- Telegram Bot: `packages/agent-provisioning/services/telegram-bot/src/handlers/webhook.ts`
- API Examples: `docs/guides/api-examples.md`
- Payment Protocol: `docs/design-decisions/technical-innovations.md`

