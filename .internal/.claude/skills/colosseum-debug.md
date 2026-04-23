# Colosseum Debugging & Diagnostics

**Metadata**: Error codes, failure patterns, troubleshooting procedures  
**Activation Triggers**: "error", "failed", "debugging", "not working", "Docker", "build", "container", "timeout", "connection", "network", "signature", "authentication", "401", "slow", "performance", "memory", "logs", "logging", "trace"  
**Token Cost**: ~90 tokens (metadata only), ~350 tokens (full content)

---

## 1. Error Code Reference Table

| Prefix | Category | Examples | Cause |
|--------|----------|----------|-------|
| `[HFSP_X402_*]` | x402 Payment | `[HFSP_X402_PAYMENT_INITIATED]`, `[HFSP_X402_INTENT_CLASSIFIED]` | Payment protocol lifecycle events |
| `[PAYMENT_*]` | Payment Execution | `[PAYMENT_TIMEOUT]`, `[PAYMENT_FAILED]`, `[PAYMENT_INVALID_SIGNATURE]` | Transaction processing errors |
| `[FEE_*]` | Fee Collection | `[FEE_INSUFFICIENT_BALANCE]`, `[FEE_COLLECTION_FAILED]` | Fee deduction issues |
| `[MEMPALACE_*]` | Memory System | `[MEMPALACE_TX_NOT_FOUND]`, `[MEMPALACE_WRITE_FAILED]` | Knowledge graph storage errors |
| `[WING_*]` | Multi-Wing Routing | `[WING_SWAP_FAILED]`, `[WING_CLASSIFY_FAILED]`, `[WING_TRANSFER_TIMEOUT]` | Transaction wing execution errors |
| `[TX_API_*]` | Transaction API | `[TX_API_INVALID_REQUEST]`, `[TX_API_RATE_LIMITED]` | API contract violations |
| `[SWAP_*]` | Swap-Specific | `[SWAP_INSUFFICIENT_LIQUIDITY]`, `[SWAP_SLIPPAGE_EXCEEDED]` | Token swap failures |
| `[TRANSFER_*]` | Transfer-Specific | `[TRANSFER_RECIPIENT_NOT_FOUND]`, `[TRANSFER_AMOUNT_ZERO]` | Transfer validation failures |
| `[BOOKING_*]` | Booking-Specific | `[BOOKING_CAPACITY_FULL]`, `[BOOKING_EXPIRED]` | Reservation failures |

---

## 2. Health Check Endpoints & Interpretation

### Agent Brain `/health`

```bash
curl http://localhost:3334/health | jq .

# Expected response:
{
  "status": "ok",
  "service": "agent-brain",
  "timestamp": "2026-04-23T12:34:56.789Z",
  "uptime": 123.456
}
```

**Status Meanings**:
- `"ok"` - Service is healthy and ready for requests
- `"starting"` - Service is still initializing (wait 5 seconds)
- `"degraded"` - Service is running but performance is impacted
- (No response) - Service is down/unreachable

**Uptime**: Seconds since service started. If very low (< 5), service just restarted.

### Telegram Bot `/health`

```bash
curl http://localhost:3335/health | jq .

# Expected response:
{
  "status": "healthy",
  "service": "telegram-bot",
  "timestamp": "2026-04-23T12:34:56.789Z"
}
```

**Status Meanings**:
- `"healthy"` - Webhook is receiving and processing messages
- `"starting"` - Service initializing
- (No response) - Service is down

### Clawdrop MCP `/health`

```bash
curl http://localhost:3001/health | jq .

# Expected response:
{
  "status": "ok",
  "version": "1.0.0",
  "enabled_features": ["swap", "transfer", "booking"],
  "uptime": 456.789
}
```

---

## 3. Common Failure Patterns & Fixes

### Docker Build Cache Corruption

**Symptom**: Build fails with `failed to prepare extraction snapshot...parent snapshot...does not exist: not found`

**Root Cause**: Docker's builder cache has corrupted layers (usually after system interruption or disk space issues)

**Fix**:
```bash
# Clear all Docker cache and rebuild
docker system prune -a --volumes -f
docker compose build --no-cache

# If still fails, restart Docker daemon
# macOS: Click Docker icon → Restart
# Linux: sudo systemctl restart docker
```

**Verification**:
```bash
docker compose up -d
docker compose ps  # All services should show "Up"
```

---

### Telegram Signature Validation Failure

**Symptom**: Webhook returns `401 Unauthorized` or logs show `"Invalid signature received"`

**Root Cause**: Missing or mismatched `X-Telegram-Bot-Api-Secret-Token` header

**Debug Steps**:
```bash
# 1. Check environment variable is set
echo $TELEGRAM_SECRET_TOKEN
# Should output your secret token (not empty)

# 2. Verify it matches docker-compose.yml
docker compose exec telegram-bot env | grep TELEGRAM_SECRET_TOKEN

# 3. Check header is being sent correctly (note: header name is case-sensitive)
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: YOUR_SECRET_TOKEN" \
  -d '{"update_id": 1}'
```

**Fix**: Regenerate secret token and update all references:
```bash
# Generate new token
openssl rand -hex 32
# Output: abc123def456...

# Update .env file
TELEGRAM_SECRET_TOKEN=abc123def456...

# Restart services
docker compose down
docker compose up -d
```

---

### Agent Brain Timeout

**Symptom**: `POST /message` takes > 5 seconds, or connection times out

**Root Cause**: 
1. Service not running
2. Service port not exposed
3. Network connectivity issue (Docker)

**Debug Steps**:
```bash
# 1. Check if service is running
docker compose ps agent-brain
# Should show "Up" status

# 2. Check if service is healthy
curl http://localhost:3334/health

# 3. View service logs for errors
docker compose logs agent-brain | tail -20

# 4. Check Docker network connectivity
docker exec hfsp-telegram-bot curl http://agent-brain:3334/health
# If this fails, network is broken
```

**Fix**:
```bash
# Restart the service
docker compose restart agent-brain

# Or if logs show errors, view full logs
docker compose logs agent-brain

# If Mastra service is down, that's the issue
# Watch for: "Mastra connection refused" or "ECONNREFUSED"
```

---

### MemPalace Transaction Not Found

**Symptom**: Error `[MEMPALACE_TX_NOT_FOUND]` when querying transaction history

**Root Cause**: Transaction ID doesn't exist or format is wrong

**Debug Steps**:
```bash
# 1. List recent transactions
npx @clawdrop/cli list-transactions --limit 10

# 2. Check specific transaction
npx @clawdrop/cli get-transaction --id tx_abc123

# 3. Verify database exists
npx @clawdrop/cli backup-db --output test.json
# If this fails, database isn't initialized

# 4. Check format of transaction IDs you're using
# Format should be: tx_[UUID or alphanumeric]
# Not: transaction_123 or just 123
```

**Fix**:
```bash
# If transaction doesn't exist, you must record it first
npx @clawdrop/cli record-transaction \
  --operation swap \
  --amount 1000 \
  --user-id user_123

# If database is corrupted, reinitialize
npx @clawdrop/cli init-mempalace --force
npx @clawdrop/cli seed-transactions --count 5
```

---

### x402 Intent Classification Ambiguous

**Symptom**: Error `[WING_CLASSIFY_FAILED]` - cannot determine transaction type

**Root Cause**: User intent is unclear or confidence score is below threshold (usually < 0.6)

**Debug Steps**:
```bash
# Check what intent was classified
# Look in logs for: "intent_classified: X, confidence: Y"
docker compose logs clawdrop-mcp | grep "intent_classified"

# If confidence < 0.6, the intent is ambiguous
# Example: User says "move money" (could be transfer OR booking)
```

**Fix**: Require more specific instructions from user:
```
Bad:  "Process this transaction"
Good: "Swap 1000 USDC for SOL"

Bad:  "Do something with my money"
Good: "Transfer 500 USDC to alice"
```

---

### Service Port Already in Use

**Symptom**: Error `EADDRINUSE: address already in use :::3334`

**Root Cause**: Another process is using the port

**Debug Steps**:
```bash
# 1. Find what's using port 3334
lsof -i :3334
# Output: COMMAND   PID   USER   FD  TYPE  DEVICE SIZE NODE NAME
#        node      12345 user    123  IPv4  ...     ... 3334

# 2. Kill the process
kill -9 12345

# Or restart Docker (kills all containers)
docker compose restart agent-brain
```

**Fix**:
```bash
# Option 1: Kill the existing process (above)

# Option 2: Change the port in .env
PORT=3336 npm run dev
# Then access on http://localhost:3336

# Option 3: Use docker compose (handles ports automatically)
docker compose down  # Frees all ports
docker compose up -d # Reallocate ports
```

---

## 4. Testing Procedures

### 3-Terminal Local Integration Setup

**Terminal 1: Start Services**
```bash
docker compose up -d
sleep 5  # Wait for startup
```

**Terminal 2: Health Checks**
```bash
# Check all services
curl http://localhost:3334/health | jq .
curl http://localhost:3335/health | jq .
curl http://localhost:3001/health | jq .

# All should return status: ok/healthy
```

**Terminal 3: Message Test**
```bash
# Test agent-brain directly
curl -X POST http://localhost:3334/message \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "chat_id": "test_chat",
    "text": "Hello agent",
    "message_id": 1
  }' | jq .

# Expected response:
# {
#   "status": "ok",
#   "response": "I received your message: \"Hello agent\"...",
#   ...
# }

# Test telegram webhook
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: test_secret_token_12345678" \
  -d '{
    "update_id": 123456789,
    "message": {
      "message_id": 1,
      "date": 1234567890,
      "chat": {"id": 987654321, "type": "private"},
      "from": {"id": 111222333, "is_bot": false, "first_name": "Test"},
      "text": "Test message"
    }
  }' | jq .

# Expected response:
# {
#   "ok": true
# }
```

---

## 5. Log Interpretation Guide

### Pino JSON Log Format

All Colosseum services use Pino for structured logging:

```json
{
  "level": 30,
  "time": 1776949149107,
  "pid": 18,
  "hostname": "291677c08cb8",
  "msg": "Message received",
  "userId": 111222333,
  "chatId": 987654321,
  "messageId": 1
}
```

**Key Fields**:
- `level`: Log severity (10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal)
- `time`: Unix timestamp in milliseconds
- `pid`: Process ID
- `hostname`: Container or machine hostname
- `msg`: Log message
- Additional fields: Context-specific data (userId, error, stack, etc.)

### Filter Logs by Level

```bash
# Show only errors
docker compose logs agent-brain | jq 'select(.level >= 50)'

# Show only info and above
docker compose logs agent-brain | jq 'select(.level >= 30)'

# Show messages containing "error"
docker compose logs agent-brain | grep -i error

# Real-time tail with color
docker compose logs -f agent-brain | jq .
```

### Interpret Common Log Patterns

```bash
# Transaction started
"msg": "Classifying intent"
"intent": "swap"
"confidence": 0.95

# Payment processed
"msg": "Payment processed"
"transaction_id": "tx_abc123"
"amount": 1000
"fee": 75

# Error with context
"level": 50
"msg": "Error processing webhook"
"error": "ECONNREFUSED"
"service": "agent-brain"
# ^ This means agent-brain service isn't responding
```

---

## 6. Context Engineering Diagnostic

Colosseum uses "context engineering" to reduce token waste. Diagnose token efficiency:

**Symptoms of Token Waste**:
1. Many repeated "discovery" queries (asking same question multiple times)
2. Long error debugging cycles (4-8 turns to fix one issue)
3. Large documentation loads in context (500+ line docs)
4. Agent asking "how do I..." for things documented in skills

**Optimization Checklist**:
- ✅ Are metadata endpoints returning structured state?
- ✅ Are skills installed and working (check `npx skills list`)?
- ✅ Are error responses including debug hints?
- ✅ Is session-closer metadata service being used?
- ✅ Are all 4 agents accessing shared skills?

**Token Cost Baseline**:
```
Expected per session (4 agents):
- Before optimization: 12-16M tokens
- After Phase 1 (metadata): 10-12M tokens (20-30% savings)
- After Phase 2 (skills): 8-10M tokens (35-50% cumulative)
- After Phase 3 (session-closer): 6-8M tokens (50-75% cumulative)

If your actual cost is higher than expected, something is generating extra tokens.
```

---

## 7. Debugging Checklist

Use this checklist when troubleshooting Colosseum:

```
Service Not Responding:
  ☐ Is the service running? (docker compose ps)
  ☐ Is it healthy? (GET /health)
  ☐ Can you reach it? (curl http://localhost:PORT/health)
  ☐ What do logs say? (docker compose logs -f SERVICE)

Request Failed:
  ☐ Is the request format correct? (See colosseum-sdk.md)
  ☐ Are required headers present? (X-Telegram-Bot-Api-Secret-Token)
  ☐ Is the service processing? (Check logs for "msg")
  ☐ What's the error code? (Reference error code table above)

Docker/Network Issue:
  ☐ Are all containers running? (docker compose ps shows "Up")
  ☐ Can containers reach each other? (docker exec ... curl)
  ☐ Is the network created? (docker network ls | grep hfsp-network)
  ☐ Port conflicts? (lsof -i :PORT)

Configuration Issue:
  ☐ Are all .env variables set? (docker compose exec ... env)
  ☐ Do values match docker-compose.yml? (AGENT_BRAIN_URL=http://agent-brain:3334)
  ☐ Are secrets correct? (TELEGRAM_SECRET_TOKEN, wallet keys)
  ☐ Is LOG_LEVEL set for debugging? (DEBUG=true or LOG_LEVEL=debug)

Data Issue:
  ☐ Does transaction exist? (npx @clawdrop/cli get-transaction)
  ☐ Is database initialized? (npx @clawdrop/cli list-tables)
  ☐ Are tiers configured? (npx @clawdrop/cli list-tiers)
  ☐ Check MemPalace status (npx @clawdrop/cli status)
```

---

## Quick Reference: Common Fixes

| Problem | Command |
|---------|---------|
| Service won't start | `docker compose logs SERVICE \| tail -50` |
| Port in use | `lsof -i :PORT \| grep LISTEN \| awk '{print $2}' \| xargs kill -9` |
| Rebuild needed | `docker compose build --no-cache` |
| Cache corrupted | `docker system prune -a --volumes -f` |
| Need logs | `docker compose logs -f SERVICE` |
| Health check | `curl http://localhost:PORT/health` |
| Reset everything | `docker compose down -v && docker compose up -d` |

---

## Source References

- Error definitions: Check `scripts/logging/error-codes.ts` (if exists)
- Logging setup: See `src/utils/logger.ts` in each service
- Health endpoints: Each service's `src/index.ts`
- Testing guide: `docs/guides/telegram-bridge-testing.md`

