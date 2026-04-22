# Changes Summary: Using Existing Bot

## Original Plan
- Create a new Telegram bot for agent interactions

## Updated Plan (Current)
- **Reuse existing `hfsp_minibot`** ✅
- Add agent chat capabilities to existing bot
- No need to create/manage separate bot
- Token already secured at `/home/clawd/.openclaw/secrets/hfsp_agent_bot.token`

## What Changed

### Code Changes
1. **telegram-api.ts**: Added support for reading token from file
   ```typescript
   // Now supports both:
   TELEGRAM_BOT_TOKEN_FILE=/path/to/token.txt
   TELEGRAM_BOT_TOKEN=direct_token_value
   ```

2. **index.ts**: Added file reading capability
   - Reads from `TELEGRAM_BOT_TOKEN_FILE` if available
   - Falls back to `TELEGRAM_BOT_TOKEN` env var

### Configuration Changes
1. **.env.example**: Updated to reference existing bot
   ```bash
   # Option 1: Use token file (RECOMMENDED)
   TELEGRAM_BOT_TOKEN_FILE=/home/clawd/.openclaw/secrets/hfsp_agent_bot.token
   
   # Option 2: Use token directly (development)
   # TELEGRAM_BOT_TOKEN=your_token_here
   ```

### Documentation Changes
1. **README.md**: Clarified integration with existing bot
2. **DEPLOYMENT.md**: Updated webhook registration instructions
3. **NEXT_STEPS.md**: Added coordination with storefront-bot

## Benefits

✅ **No new bot to manage** - Uses existing `hfsp_minibot`
✅ **Token already secured** - Stored in production secrets
✅ **Single bot identity** - Cleaner for users
✅ **Integrated experience** - One bot, multiple capabilities
✅ **Less maintenance** - Don't need to track another bot

## Integration Architecture

```
hfsp_minibot (existing)
├── Mini App (onboarding, wallet setup) [storefront-bot]
└── Agent Chat (NEW) [telegram-bot]
    └── Messages → agent-brain → responses with approvals
```

## Webhook Registration

**Before:** Would need to create new bot via @BotFather
**Now:** Just register webhook for existing bot

```bash
TOKEN=$(cat /home/clawd/.openclaw/secrets/hfsp_agent_bot.token)
curl -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" ...
```

One command instead of multiple steps.

## Coordination with Storefront-Bot

Since both services may handle the same bot, need to:

1. **Check current webhook**: What's currently registered?
   ```bash
   TOKEN=$(cat /home/clawd/.openclaw/secrets/hfsp_agent_bot.token)
   curl "https://api.telegram.org/bot${TOKEN}/getWebhookInfo"
   ```

2. **Coordinate registration**: Either
   - Keep both webhooks separate
   - Combine into single handler
   - Sequential registration

See [DEPLOYMENT.md](./DEPLOYMENT.md) for options.

## No Breaking Changes

- Existing bot continues to work as before
- Mini app functionality unaffected
- Can activate agent chat when ready

## Test Command (Unchanged)

```bash
npm install
npm run dev
```

Server still runs on port 3335.

## Deployment (Simplified)

```bash
docker-compose up -d agent-brain telegram-bot
# Webhook registration: curl ... setWebhook ...
# Done! Bot now handles both mini app + agent chat
```

That's it. No new bot to manage, no new secrets to secure beyond what already exists.
