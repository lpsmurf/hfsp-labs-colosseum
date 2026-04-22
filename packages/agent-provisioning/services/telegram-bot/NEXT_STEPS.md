# Next Steps for Telegram Bridge Implementation

## ✅ COMPLETED - Infrastructure & Integration Setup

### Telegram Bot Agent Bridge ✅
- [x] Express webhook server on port 3335
- [x] Secure webhook endpoint with signature validation
- [x] Message parsing (extract user_id, chat_id, text)
- [x] Agent-brain client integration
- [x] Approval button formatting
- [x] Dockerfile and Docker Compose setup
- [x] **Integrated with existing `hfsp_minibot`** (no new bot needed!)
- [x] Support for reading token from file

## 🚀 IMMEDIATE NEXT STEPS

### 1. Register Webhook with Existing Bot (Priority: HIGH)

```bash
# Get the bot token
TOKEN=$(cat /home/clawd/.openclaw/secrets/hfsp_agent_bot.token)

# Generate secret token
SECRET=$(openssl rand -hex 32)

# Register webhook
curl -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"https://yourdomain.com/telegram/webhook\",
    \"secret_token\": \"${SECRET}\",
    \"allowed_updates\": [\"message\", \"callback_query\"]
  }"

# Verify
curl "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
```

**Important:** This assumes the bot isn't currently handling a different webhook. If it is, see "Coordinate with storefront-bot" below.

### 2. Test Integration (Priority: HIGH)

```bash
# Build services
cd packages/agent-provisioning
docker-compose build agent-brain telegram-bot

# Start services
docker-compose up -d agent-brain telegram-bot

# Check logs
docker-compose logs -f telegram-bot

# Test webhook
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $(cat .env | grep TELEGRAM_SECRET_TOKEN)" \
  -d '{"update_id": 1, "message": {"message_id": 1, "chat": {"id": 123}, "from": {"id": 456}, "text": "Hello"}}'
```

### 3. Send Test Message (Priority: HIGH)

1. Open Telegram and find `hfsp_minibot`
2. Send a message: "Hello, agent!"
3. Check logs to see it was received
4. Agent should respond with placeholder message

### 4. Coordinate with Storefront-Bot (Priority: MEDIUM)

The existing `storefront-bot` may already have a webhook registered. Options:

**Option A: Keep Both Separate (Easiest)**
- Register telegram-bot's webhook after storefront-bot finishes handling updates
- Use sequential webhook registration
- Each service handles its message type independently

**Option B: Combine Handlers (Better)**
- Import telegram-bot handlers into storefront-bot
- Have storefront-bot route messages to appropriate handlers
- Single webhook, cleaner architecture

**Option C: Check Current Status**
```bash
TOKEN=$(cat /home/clawd/.openclaw/secrets/hfsp_agent_bot.token)
curl "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
# See what's currently registered
```

## 📋 AGENT-BRAIN ENHANCEMENTS (Required for Full Functionality)

### 1. Wire Claude LLM (Priority: HIGH)

The agent-brain currently returns a placeholder response. Need to:

```typescript
// In agent-brain/services/mastra-agent.ts
const response = await anthropic.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 1024,
  system: manifest.systemPrompt,
  messages: [{ role: "user", content: userMessage }],
  tools: [...skills],
});
```

### 2. Implement Approval Execution (Priority: HIGH)

Currently, users can click Approve/Reject buttons, but nothing happens. Need to:

- [ ] Store pending approval requests in database
- [ ] On approval, execute the actual action
- [ ] Update message with result
- [ ] Handle approval timeout

Example flow:
```
User: "Book me a flight to Miami for $500"
Agent: "This requires approval for $500. Approve?"
User: Clicks "Approve"
Action: Actually book the flight
Response: "✅ Flight booked! Confirmation: ABC123"
```

### 3. Spending Limit Logic (Priority: MEDIUM)

```typescript
// In MessageHandler
const APPROVAL_THRESHOLD = 100; // dollars

if (totalSpending > APPROVAL_THRESHOLD) {
  return {
    response: `This action costs $${totalSpending}. Approve?`,
    requiresApproval: true,
    approvalAmount: totalSpending,
  };
}
```

### 4. Tool Integration (Priority: MEDIUM)

Define available tools for the agent:
- Flight booking
- Trading signals
- DAO setup
- Balance transfers
- etc.

```typescript
// agent.ts
const tools = [
  {
    name: "book_flight",
    description: "Book a flight for the user",
    inputSchema: {...},
  },
  // ... more tools
];
```

## 📋 TELEGRAM-BOT ENHANCEMENTS (Optional but Recommended)

### Database for Approvals (Priority: MEDIUM)

Replace in-memory Map with persistent storage:

```typescript
// In handlers/approval.ts
// Current: Map<string, ApprovalData>
// Needed: SQLite or PostgreSQL table

CREATE TABLE pending_approvals (
  id TEXT PRIMARY KEY,
  user_id INTEGER,
  chat_id INTEGER,
  action TEXT,
  amount DECIMAL,
  created_at TIMESTAMP,
  expires_at TIMESTAMP,
  status TEXT -- pending, approved, rejected
);
```

### Conversation History (Priority: LOW)

```typescript
// Store messages per user
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  chat_id INTEGER,
  message TEXT,
  response TEXT,
  created_at TIMESTAMP
);
```

### Webhook Automation (Priority: LOW)

Auto-register webhook on service startup:

```typescript
// On app startup, call Telegram setWebhook
// Add retries and error handling
// Verify webhook works before considering ready
```

## 📊 TESTING CHECKLIST

### Local Development

- [ ] Services build: `npm run build`
- [ ] Server starts: `npm run dev`
- [ ] Health check works: `curl http://localhost:3335/health`
- [ ] Webhook validates signature correctly
- [ ] Invalid signature returns 401
- [ ] Valid update is processed

### Integration

- [ ] `docker-compose up` starts both services
- [ ] Services can communicate on hfsp-network
- [ ] Agent-brain `/message` endpoint works
- [ ] Telegram API calls succeed

### End-to-End

- [ ] Webhook registered with Telegram
- [ ] Send message to bot in Telegram
- [ ] Message appears in logs
- [ ] Agent responds
- [ ] Response appears in Telegram chat
- [ ] Buttons appear for approval requests
- [ ] Button clicks are processed
- [ ] Error messages show if something fails

## 🔗 INTEGRATION POINTS

### With Existing Bot (`hfsp_minibot`)
- Token already stored at `/home/clawd/.openclaw/secrets/hfsp_agent_bot.token`
- Bot handles mini app + now also agent chat
- Single webhook registers both flows

### With Agent-Brain
- `/message` endpoint expects: `{ user_id, message }`
- Returns: `{ response, requiresApproval?, approvalAmount? }`
- No changes needed to agent-brain yet (just LLM wiring)

### With Storefront-Bot
- May have existing webhook
- Coordinate to avoid conflicts
- Can run simultaneously if using different update types

## 🎯 MILESTONE 2 COMPLETION CRITERIA

| Criterion | Status | Notes |
|-----------|--------|-------|
| Telegram webhook receives messages | ✅ Ready | Infrastructure complete |
| Messages forwarded to agent-brain | ✅ Ready | Client implemented |
| Agent responds | ⏳ Needs LLM | Currently returns placeholder |
| Spending approvals shown | ✅ Ready | Buttons formatted |
| Users can click approve/reject | ⏳ Needs DB | Button clicks routed, needs execution |
| Approved actions execute | ❌ Not started | Needs agent-brain implementation |
| Production deployment ready | ⏳ Partial | Webhook registration needed |

**Current: 4/7 complete - Infrastructure done, needs LLM + execution**

## 📝 DEPLOYMENT STEPS (When Ready)

1. **Register webhook:** `curl ... setWebhook ...` (one-time)
2. **Deploy services:** `docker-compose up -d`
3. **Verify:** Check `getWebhookInfo`, send test message
4. **Monitor:** `docker logs -f hfsp-telegram-bot`
5. **Test:** Message bot, click buttons, verify flow works

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.
