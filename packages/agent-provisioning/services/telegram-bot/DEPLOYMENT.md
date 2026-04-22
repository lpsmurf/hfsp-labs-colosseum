# Telegram Bridge Deployment Guide

This service adds agent chat capabilities to the **existing `hfsp_minibot`**.

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- Access to bot token (already secured at `/home/clawd/.openclaw/secrets/hfsp_agent_bot.token`)
- Agent-brain running on port 3334

### Steps

1. **Clone and setup:**
```bash
cd packages/agent-provisioning/services/telegram-bot
npm install
cp .env.example .env
```

2. **Configure .env for local development:**
```bash
# Use the actual bot token file (production location)
TELEGRAM_BOT_TOKEN_FILE=/home/clawd/.openclaw/secrets/hfsp_agent_bot.token

# OR for development with a copy:
TELEGRAM_BOT_TOKEN=<get the token from the file>

# Generate secret token
TELEGRAM_SECRET_TOKEN=$(openssl rand -hex 32)

# For local testing with ngrok
TELEGRAM_WEBHOOK_URL=https://your-ngrok-url.ngrok.io/webhook

# Agent brain
AGENT_BRAIN_URL=http://localhost:3334
NODE_ENV=development
```

3. **Start the bot:**
```bash
npm run dev
```

Server will listen on http://localhost:3335

4. **For local testing with Telegram:**
```bash
# In another terminal, start ngrok
ngrok http 3335

# Copy the ngrok URL and update your .env
TELEGRAM_WEBHOOK_URL=https://abc123.ngrok.io/webhook

# Restart the bot
# Then register the webhook (see below)
```

## Production Deployment (Docker)

### Prerequisites
- Docker & Docker Compose
- Bot token already secured at `/home/clawd/.openclaw/secrets/hfsp_agent_bot.token`
- HTTPS domain for webhook
- Agent-brain running

### Configuration

```bash
cd packages/agent-provisioning
cp .env.example .env
```

Edit `.env`:
```bash
# This is the existing bot - don't create a new one!
# Just configure where its token is stored

TELEGRAM_BOT_TOKEN_FILE=/home/clawd/.openclaw/secrets/hfsp_agent_bot.token

# Generate a random secret for webhook validation
TELEGRAM_SECRET_TOKEN=$(openssl rand -hex 32)

# Your public HTTPS endpoint
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/telegram/webhook

# Agent brain (docker service name or URL)
AGENT_BRAIN_URL=http://agent-brain:3334

NODE_ENV=production
```

### Build and Run

```bash
# Build both services
docker-compose build agent-brain telegram-bot

# Start both services
docker-compose up -d agent-brain telegram-bot

# Check logs
docker-compose logs -f telegram-bot
```

## Webhook Registration (One-Time Setup)

Register this service's webhook with the **existing bot**:

### Get the Bot Token

```bash
TOKEN=$(cat /home/clawd/.openclaw/secrets/hfsp_agent_bot.token)
echo $TOKEN
```

### Register the Webhook

```bash
TOKEN=$(cat /home/clawd/.openclaw/secrets/hfsp_agent_bot.token)
SECRET=$(cat /path/to/your/.env | grep TELEGRAM_SECRET_TOKEN | cut -d= -f2)
URL="https://yourdomain.com/telegram/webhook"

curl -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${URL}\",
    \"secret_token\": \"${SECRET}\",
    \"allowed_updates\": [\"message\", \"callback_query\"]
  }"
```

**Important:** This overwrites the bot's webhook. If the bot currently has a webhook for something else (like the mini app), you need to:

**Option A:** Merge both handlers
- Have one webhook that handles both mini app updates and chat messages
- Route based on update type in a single handler

**Option B:** Use different endpoints
- Keep mini app webhook separate
- Register this as a second webhook (requires separate bot, OR clever routing)

### Verify Webhook Registration

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
    "pending_update_count": 0,
    "allowed_updates": ["message", "callback_query"]
  }
}
```

### For Local Testing (ngrok)

```bash
# Start ngrok
ngrok http 3335

# Get the forwarding URL (something like https://abc123.ngrok.io)

# Register it
TOKEN=$(cat /home/clawd/.openclaw/secrets/hfsp_agent_bot.token)
SECRET=your_test_secret

curl -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"https://abc123.ngrok.io/webhook\",
    \"secret_token\": \"${SECRET}\"
  }"

# Now messages sent to the bot will arrive at your local webhook
```

## Integration with Storefront-Bot

If `storefront-bot` is already running and handling webhook updates, you have options:

### Option 1: Sequential Webhooks (Recommended for now)
- Keep storefront-bot's existing webhook
- Register telegram-bot as a separate webhook when ready
- Each service handles its own message types

### Option 2: Combined Handler (Future)
- Have storefront-bot's webhook forward to telegram-bot for agent messages
- Avoids duplicate webhook registration

### Option 3: Import telegram-bot into storefront-bot
- Integrate this service's handlers into storefront-bot
- Single webhook, shared codebase

Currently, **Option 1** (sequential registration) is safest during rollout.

## Monitoring

### Check logs:
```bash
docker logs -f hfsp-telegram-bot
```

### Check webhook status:
```bash
TOKEN=$(cat /home/clawd/.openclaw/secrets/hfsp_agent_bot.token)
curl "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
```

Should show:
- `"pending_update_count": 0` (no stuck messages)
- `"last_error_date"` should be recent (if there were errors)
- `"last_error_message"` should be empty (no current errors)

### Check service health:
```bash
curl http://localhost:3335/health
# Should return: {"status":"ok","timestamp":"..."}
```

### View real-time logs:
```bash
docker logs -f hfsp-telegram-bot | grep -E "Message|Agent|Error"
```

## Common Issues

### "Invalid webhook signature"
- Check `TELEGRAM_SECRET_TOKEN` is set correctly
- Verify it matches what was registered with Telegram
- Ensure it's passed in `X-Telegram-Bot-Api-Secret-Token` header

### "Webhook pending updates" counter > 0
- Service isn't responding to Telegram
- Check if webhook URL is reachable
- Check firewall/SSL certificate
- Review service logs for errors

### "Bot token is invalid"
- Token file doesn't exist at `TELEGRAM_BOT_TOKEN_FILE`
- Token in file is truncated or corrupted
- Try reading the file directly: `cat /home/clawd/.openclaw/secrets/hfsp_agent_bot.token`

### "Agent not responding"
- Check agent-brain is running: `docker logs -f hfsp-agent-brain`
- Verify `AGENT_BRAIN_URL` is correct
- Test network connectivity: `docker exec hfsp-telegram-bot curl http://agent-brain:3334/health`

### "Certificate verification failed"
- HTTPS certificate expired
- Self-signed certificate not trusted
- For testing: disable verification (NOT for production)

### "Webhook URL is not accessible"
- Check URL is HTTPS (required by Telegram)
- Verify domain resolves
- Check firewall allows port 443
- Test manually: `curl -I https://yourdomain.com/telegram/webhook`

## Production Checklist

- [ ] Bot token loaded from secure file
- [ ] Secret token is random (32+ chars)
- [ ] Webhook URL is HTTPS with valid certificate
- [ ] Webhook registered with correct bot
- [ ] `allowed_updates` includes "message" and "callback_query"
- [ ] Agent-brain service is running and accessible
- [ ] Services on same docker network
- [ ] Logs are configured for debugging
- [ ] Health check endpoint working
- [ ] Monitoring/alerting configured
- [ ] Rate limiting configured per user

## Scaling

For production with high volume:

1. **Load balancing:** Run multiple telegram-bot instances behind nginx
2. **Message queue:** Use Redis to queue pending messages
3. **Database:** Move approvals from in-memory to persistent storage
4. **Caching:** Cache agent responses for common questions

See [NEXT_STEPS.md](./NEXT_STEPS.md) for implementation details.

## Secrets Management

**DO NOT commit token files or .env with real tokens.**

For production, use Docker secrets:

```bash
# Create secret from file
docker secret create telegram_bot_token /path/to/token.txt

# Reference in docker-compose
telegram-bot:
  environment:
    TELEGRAM_BOT_TOKEN_FILE: /run/secrets/telegram_bot_token
```

Or use a secrets manager (HashiCorp Vault, AWS Secrets Manager, etc.)
