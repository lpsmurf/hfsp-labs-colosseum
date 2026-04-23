# Telegram Bridge Testing Guide - Docker Integration

**Status**: Ready for testing  
**Duration**: 30-45 minutes  
**Prerequisites**: Docker, docker-compose, Telegram bot token

---

## Quick Start (5 minutes)

### 1. Get Telegram Bot Token

If you don't have a token yet:
1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Type `/newbot`
3. Follow prompts to create bot
4. Copy the bot token (e.g., `123456:ABCdef-GHIjklmn`)
5. Note the **Numeric Bot ID** (first part before `:`)

### 2. Generate Secret Token

```bash
openssl rand -hex 32
# Example output: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
```

### 3. Prepare Environment File

```bash
cd packages/agent-provisioning/services/telegram-bot
cp .env.example .env
```

Edit `.env` with your values:
```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_BOT_ID=your_numeric_id_here
TELEGRAM_SECRET_TOKEN=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/telegram/webhook  # We'll update this
AGENT_BRAIN_URL=http://agent-brain:3334  # For Docker
NODE_ENV=development
```

### 4. Start Docker Services

```bash
# From telegram-bot directory
docker-compose up
```

You should see:
```
hfsp-agent-brain    | ✅ Agent Brain listening on port 3334
hfsp-telegram-bot   | ✅ Telegram Bot listening on port 3335
```

### 5. Verify Services Running

In another terminal:
```bash
# Check container status
docker ps

# Should see:
# hfsp-agent-brain    port 3334
# hfsp-telegram-bot   port 3335
```

---

## Phase 1: Local Testing (No Webhook)

### Test 1: Health Check - Agent Brain

```bash
curl http://localhost:3334/health
```

Expected:
```json
{
  "status": "ok",
  "timestamp": "2026-04-22T...",
  "uptime": 5.123
}
```

### Test 2: Health Check - Telegram Bot

```bash
curl http://localhost:3335/health
```

Expected:
```json
{
  "status": "ok",
  "service": "telegram-bot",
  "timestamp": "2026-04-22T..."
}
```

### Test 3: Direct Message to Agent Brain

```bash
curl -X POST http://localhost:3334/message \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user_123",
    "chat_id": "test_chat_456",
    "text": "What is your status?",
    "message_id": 1
  }'
```

Expected response from agent-brain:
```json
{
  "status": "ok",
  "response": "Agent brain is operational",
  "user_id": "test_user_123"
}
```

### Test 4: Container Logs

Check what each service is doing:

```bash
# Agent brain logs
docker logs hfsp-agent-brain

# Telegram bot logs
docker logs hfsp-telegram-bot

# Follow logs in real-time
docker logs -f hfsp-telegram-bot
```

### Test 5: Network Connectivity

Verify containers can communicate:

```bash
# Access telegram-bot container
docker exec -it hfsp-telegram-bot sh

# Inside container, test agent-brain
curl http://agent-brain:3334/health

# Should work! Exit with: exit
```

---

## Phase 2: Webhook Setup (Production)

### Prerequisites

You need a public URL and domain. Options:

**Option A: Local Testing with ngrok** (5 min setup)
```bash
# Install ngrok: https://ngrok.com/download
ngrok http 3335

# Copy the public URL (e.g., https://abc123.ngrok.io)
```

**Option B: Production Server**
- VPS with public IP
- Domain name pointing to VPS
- HTTPS certificate (Let's Encrypt)

**Option C: Cloudflare Tunnel** (recommended)
```bash
# Install cloudflare: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
cloudflared tunnel run --url http://localhost:3335
```

### Step 1: Register Webhook with Telegram

```bash
# Set your domain here
DOMAIN="https://yourdomain.com"  # or ngrok URL
BOT_TOKEN="your_bot_token"
SECRET="your_secret_token"

curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"${DOMAIN}/telegram/webhook\",
    \"secret_token\": \"${SECRET}\",
    \"allowed_updates\": [\"message\", \"callback_query\"]
  }"
```

Expected response:
```json
{
  "ok": true,
  "result": true,
  "description": "Webhook was set"
}
```

### Step 2: Verify Webhook Registration

```bash
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" | jq .
```

Expected:
```json
{
  "ok": true,
  "result": {
    "url": "https://yourdomain.com/telegram/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "ip_address": "...",
    "last_error_date": null,
    "last_error_message": null
  }
}
```

### Step 3: Send Test Message via Telegram

1. Open Telegram and find your bot
2. Send a message: `/start` or `Hello!`
3. Watch the logs:
   ```bash
   docker logs -f hfsp-telegram-bot
   ```

You should see:
```
[TELEGRAM] Received message from user
[AGENT_BRAIN] Sending to agent
[AGENT_BRAIN] Response received
[TELEGRAM] Sending reply back to user
```

### Step 4: Check Agent Response in Telegram

The bot should reply within 5 seconds. If not:

```bash
# Check telegram-bot logs for errors
docker logs hfsp-telegram-bot | grep -i error

# Check agent-brain logs
docker logs hfsp-agent-brain | grep -i error

# Check network connectivity
docker exec -it hfsp-telegram-bot curl http://agent-brain:3334/health
```

---

## Phase 3: Integration Testing

### Test 1: Multi-Message Flow

Send 3 messages and verify responses:

```bash
# Message 1
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 123,
    "message": {
      "message_id": 1,
      "from": {"id": "user123", "first_name": "Test"},
      "chat": {"id": "chat456"},
      "text": "Hello"
    }
  }'

# Message 2
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 124,
    "message": {
      "message_id": 2,
      "from": {"id": "user123", "first_name": "Test"},
      "chat": {"id": "chat456"},
      "text": "What can you do?"
    }
  }'

# Message 3
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 125,
    "message": {
      "message_id": 3,
      "from": {"id": "user123", "first_name": "Test"},
      "chat": {"id": "chat456"},
      "text": "Goodbye"
    }
  }'
```

### Test 2: Error Handling

Send malformed messages:

```bash
# Missing required fields
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'

# Should log error, not crash
docker logs hfsp-telegram-bot | tail -5
```

### Test 3: Concurrent Messages

Send 5 messages rapidly:

```bash
for i in {1..5}; do
  curl -X POST http://localhost:3335/webhook \
    -H "Content-Type: application/json" \
    -d "{\"update_id\": $((200 + i)), \"message\": {\"message_id\": $i, \"text\": \"Message $i\"}}" &
done
wait
```

All should be processed without errors.

### Test 4: Long Running Message

Send a long message that takes time to process:

```bash
curl -X POST http://localhost:3335/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "update_id": 500,
    "message": {
      "message_id": 100,
      "text": "This is a long message that should take time to process. The agent should handle this gracefully without timing out. Please analyze this carefully and provide a detailed response."
    }
  }'
```

Monitor response time:
```bash
docker logs hfsp-telegram-bot | grep "response_time"
```

---

## Phase 4: Production Deployment

### Option 1: Docker on VPS

```bash
# 1. SSH into VPS
ssh user@your-vps.com

# 2. Clone repo
git clone https://github.com/lpsmurf/hfsp-labs-colosseum.git
cd hfsp-labs-colosseum

# 3. Configure environment
cd packages/agent-provisioning/services/telegram-bot
cp .env.example .env
# Edit .env with production values

# 4. Start with docker-compose
docker-compose up -d

# 5. Verify
docker ps
curl http://localhost:3335/health

# 6. Check logs
docker logs hfsp-telegram-bot
```

### Option 2: PM2 on VPS

```bash
# 1. SSH into VPS
ssh user@your-vps.com

# 2. Install Node.js & PM2
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
npm install -g pm2

# 3. Clone and setup
git clone https://github.com/lpsmurf/hfsp-labs-colosseum.git
cd hfsp-labs-colosseum/packages/agent-provisioning/services/telegram-bot
npm install

# 4. Configure environment
cp .env.example .env
# Edit .env

# 5. Start services
pm2 start "npm run build && npm start" --name telegram-bot
cd ../agent-brain
npm install
pm2 start "npm run build && npm start" --name agent-brain

# 6. Save PM2 config
pm2 save
pm2 startup
```

---

## Troubleshooting

### Services Not Starting

```bash
# Check Docker daemon
docker ps

# Check logs
docker logs hfsp-telegram-bot
docker logs hfsp-agent-brain

# Rebuild containers
docker-compose build --no-cache
docker-compose up
```

### Agent Brain Not Responding

```bash
# Check if service is running
docker ps | grep agent-brain

# Test health endpoint
curl http://localhost:3334/health

# Check logs for errors
docker logs hfsp-agent-brain | grep -i error

# Restart service
docker restart hfsp-agent-brain
```

### Telegram Webhook Issues

```bash
# Verify webhook URL is correct
DOMAIN="https://yourdomain.com"
BOT_TOKEN="your_token"

curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" | jq .

# If pending updates > 0, process them
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook"
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${DOMAIN}/telegram/webhook"
```

### Message Not Being Processed

1. Check telegram-bot logs: `docker logs hfsp-telegram-bot`
2. Check agent-brain logs: `docker logs hfsp-agent-brain`
3. Verify network: `docker exec -it hfsp-telegram-bot curl http://agent-brain:3334/health`
4. Check Telegram webhook status: `getWebhookInfo`

---

## Success Checklist

- [ ] Docker containers start without errors
- [ ] Health endpoints respond (3334, 3335)
- [ ] Containers can communicate (agent-brain from telegram-bot)
- [ ] Webhook registered with Telegram (no errors)
- [ ] Webhook info shows correct URL
- [ ] Test message sent via Telegram receives response
- [ ] Multi-message flow works
- [ ] Error handling works (malformed messages don't crash)
- [ ] Concurrent messages processed
- [ ] Long messages handled gracefully
- [ ] Logs are clean (no errors)
- [ ] Services restart automatically on failure

---

## Next Steps After Testing

✅ All tests pass → **Production Deployment**
1. Configure HTTPS/SSL certificate
2. Set up Nginx reverse proxy (see config/nginx/)
3. Register real webhook URL with Telegram
4. Deploy to production VPS
5. Monitor logs and metrics

