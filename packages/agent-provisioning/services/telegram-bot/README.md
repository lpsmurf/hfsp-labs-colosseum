# Telegram Bot Agent Bridge

Connects the existing `hfsp_minibot` to agent-brain, enabling Telegram users to message the agent and receive responses with optional spending approval buttons.

## Overview

This service adds **agent chat capabilities** to the existing Telegram bot. The bot already handles:
- Mini app interactions (onboarding, wallet setup)
- Web app integration

Now it will also handle:
- **Agent messages**: Users can ask the agent to book flights, approve trading, etc.
- **Spending approvals**: Inline buttons for confirming transactions > $100

## Architecture

```
Telegram User (existing bot chat)
    ↓
Telegram Bot API (hfsp_minibot)
    ↓
Webhook Endpoint (telegram-bot:3335)
    ↓
Message Handler (parse + call agent-brain)
    ↓
Agent Brain (agent-brain:3334)
    ↓
Response with approval buttons
    ↓
Telegram User (receives agent response)
```

## Setup

### 1. Get Existing Bot Token

The bot token is already configured in:
```
/home/clawd/.openclaw/secrets/hfsp_agent_bot.token  (production)
/home/hfsp2/.openclaw/secrets/hfsp_agent_bot.token   (staging)
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```bash
# Use the existing bot token file
TELEGRAM_BOT_TOKEN_FILE=/home/clawd/.openclaw/secrets/hfsp_agent_bot.token

# Secret token for webhook validation
TELEGRAM_SECRET_TOKEN=<generate: openssl rand -hex 32>

# Where the webhook is accessible from internet
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/telegram/webhook

# Agent brain location
AGENT_BRAIN_URL=http://localhost:3334
```

OR use environment variable directly:
```bash
TELEGRAM_BOT_TOKEN=<token from file>
TELEGRAM_SECRET_TOKEN=<random secret>
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/telegram/webhook
AGENT_BRAIN_URL=http://localhost:3334
```

### 3. Register Webhook with Telegram

Register this service's webhook endpoint with the **existing bot**:

```bash
TOKEN=$(cat /home/clawd/.openclaw/secrets/hfsp_agent_bot.token)
SECRET="your_secret_token"
URL="https://yourdomain.com/telegram/webhook"

curl -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${URL}\",
    \"secret_token\": \"${SECRET}\",
    \"allowed_updates\": [\"message\", \"callback_query\"]
  }"
```

**Note:** This overwrites any existing webhook. If the bot is currently handling mini app interactions via a different webhook, you'll need to coordinate:
- Combine both handlers into one webhook, OR
- Use separate paths for mini app vs agent messages

### 4. Verify Webhook

```bash
TOKEN=$(cat /home/clawd/.openclaw/secrets/hfsp_agent_bot.token)

curl "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
```

Should show:
```json
{
  "ok": true,
  "result": {
    "url": "https://yourdomain.com/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

## Development

```bash
npm install
npm run dev
```

Server runs on port 3335.

For local testing with Telegram, use ngrok:
```bash
ngrok http 3335
# Then set TELEGRAM_WEBHOOK_URL=https://your-ngrok-url.ngrok.io/webhook
```

## Production (Docker)

```bash
docker-compose up agent-brain telegram-bot
```

The service will:
1. Read bot token from env or file
2. Generate/validate secret token
3. Listen for webhook updates
4. Forward messages to agent-brain
5. Send responses back to Telegram

## Integration with Existing Bot

### How It Works

The existing `hfsp_minibot` can now handle both:

1. **Web App interactions** (existing):
   - User opens mini app in Telegram
   - App handles onboarding, wallet setup
   - Sends updates via Web App SDK

2. **Chat messages** (NEW):
   - User types message in bot chat
   - Message → webhook → agent-brain
   - Agent responds with approval buttons if needed

### Important: Update Storefront-Bot

If `storefront-bot` is currently registering its own webhook, you need to either:

**Option A: Combine handlers** (recommended)
- Import this service's message handler into storefront-bot
- Have storefront-bot's webhook handle both flows

**Option B: Use separate update types**
- storefront-bot handles Web App updates only
- telegram-bot handles chat messages and buttons
- Register both services' webhooks with different `allowed_updates`

## API Endpoints

### POST /webhook
Receives Telegram webhook updates (messages and callback queries).

**Headers:**
- `X-Telegram-Bot-Api-Secret-Token`: Secret token for validation

**Body:** Telegram Update object

### GET /health
Health check endpoint.

## Message Flow

1. **User sends message in Telegram bot chat**
   - Telegram sends `message` update to webhook

2. **Service validates and parses**
   - Check secret token (reject if invalid)
   - Extract user_id, chat_id, message_text

3. **Call agent-brain**
   - POST `/message` with `{ user_id: "telegram:123", message: "..." }`

4. **Agent responds**
   - Return `{ response, requiresApproval?, approvalAmount? }`

5. **Format and send to Telegram**
   - Simple message: send text
   - Approval needed: add inline buttons
     - ✅ Approve $100
     - ❌ Reject

6. **User clicks button (optional)**
   - Telegram sends `callback_query` update
   - Service handles approval/rejection
   - Edit message to show status

## Error Handling

- Invalid secret token → 401 (logged, not acknowledged to Telegram)
- Agent-brain unavailable → Fallback message to user
- Telegram API errors → Logged, but webhook still acknowledged

## Environment Variables

See `.env.example` for complete reference:

```bash
# Required
TELEGRAM_BOT_TOKEN          # Bot token (or use _FILE)
TELEGRAM_BOT_TOKEN_FILE     # Path to token file
TELEGRAM_SECRET_TOKEN       # Random secret for webhook validation
TELEGRAM_WEBHOOK_URL        # Public HTTPS webhook URL

# Optional
AGENT_BRAIN_URL             # Default: http://localhost:3334
PORT                        # Default: 3335
NODE_ENV                    # Default: production
DEBUG                       # Default: false
```

## Production Checklist

- [ ] Bot token loaded from secure location
- [ ] Secret token is random and secure
- [ ] Webhook URL is HTTPS
- [ ] Webhook registered with Telegram (`setWebhook`)
- [ ] Agent-brain running and accessible
- [ ] Services on same network (`hfsp-network`)
- [ ] Logs configured for debugging
- [ ] Monitoring alerts set up
- [ ] Rate limiting configured (per user)
- [ ] Approval timeout handling implemented

## Next Steps

1. **Test locally** with ngrok
2. **Register webhook** with existing bot
3. **Test end-to-end** message flow
4. **Deploy** to production
5. **Monitor** webhook status and errors
6. **Implement approval execution** in agent-brain

See [NEXT_STEPS.md](./NEXT_STEPS.md) for remaining work.
