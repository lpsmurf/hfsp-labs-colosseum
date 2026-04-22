# Milestone 2: Telegram Bridge - Parallel Work Session

**Start Date**: 2026-04-22
**Status**: In Progress - Parallel Development
**Goal**: Connect hfsp_minibot webhook to agent-brain for agent chat + spending approvals

## Architecture Overview

```
Telegram User → Telegram Bot API → Webhook (telegram-bot:3335)
                                        ↓
                                  Parse message
                                        ↓
                              Call agent-brain API (:3334)
                                        ↓
                            Response with approval buttons
                                        ↓
                                  Send to Telegram
```

## LLM Task Assignments

### Claude (Orchestration & Core)
**Branch**: `feature/claude/telegram-bot-core`
**Responsibilities**:
- Coordinate overall implementation
- Create and maintain directory structure
- Wire components together
- Review and merge all feature PRs
- Deploy to production
- Ensure consistency across LLM implementations

**Deliverables**:
- Directory structure ✅
- package.json ✅
- tsconfig.json ✅
- Shared context file (this file) ✅
- Consolidated docker-compose.yml
- Final production deployment

### OpenAI (Webhook Handler)
**Branch**: `feature/openai/webhook-handler`
**Responsibilities**:
- Express server setup on port 3335
- POST /webhook endpoint implementation
- Telegram signature validation
- Message parsing and extraction
- Error handling and logging

**Files to Create**:
- `src/index.ts` - Express server + webhook endpoint
- `src/handlers/message.ts` - Message parsing & routing
- `src/utils/logger.ts` - Structured logging
- `src/utils/telegram-security.ts` - Signature validation

**Key Functions**:
```typescript
// Extract from Telegram message update:
- message.message_id
- message.chat.id
- message.from.id
- message.text

// Validate signature:
- X-Telegram-Bot-Api-Secret-Token header check
```

**Acceptance Criteria**:
- Server listens on port 3335
- POST /webhook accepts Telegram updates
- Signature validation works (reject 401 if invalid)
- Logging shows all message events
- Can parse message, extract user_id, chat_id, text

### Gemini (Agent Integration)
**Branch**: `feature/gemini/agent-integration`
**Responsibilities**:
- Agent-brain client implementation
- Approval flow and button handling
- Callback query handling (button clicks)
- Message forwarding to agent-brain
- Response formatting with inline buttons

**Files to Create**:
- `src/services/agent-brain-client.ts` - Call agent-brain /message
- `src/handlers/approval.ts` - Handle approval button clicks
- `src/types/index.ts` - TypeScript types for responses

**Key Functions**:
```typescript
// Call agent-brain:
POST /message
{
  "user_id": "telegram:123456",
  "message": "Book me a flight"
}

Response:
{
  "response": "...",
  "requiresApproval": boolean,
  "approvalAmount": number
}

// Handle callbacks:
- callback_query.data parsing
- Edit message to show approval status
- Store pending approvals (in-memory for now)
```

**Acceptance Criteria**:
- Agent-brain client makes successful /message calls
- Response formatting works (text + buttons)
- Approval buttons appear for spending > $100
- Button clicks are parsed correctly
- Callbacks are acknowledged to Telegram

### Kimi (Infrastructure & Deployment)
**Branch**: `feature/kimi/docker-deployment`
**Responsibilities**:
- Docker containerization
- Docker Compose configuration
- Environment variables and .env.example
- VPS deployment scripts
- Health checks and monitoring

**Files to Create**:
- `Dockerfile` - Node 20+ based image
- `docker-compose.yml` - Service definition
- `.env.example` - Configuration template
- `.dockerignore` - Build optimization
- `deployment/vps-deploy.sh` - Deployment script

**Key Components**:
```dockerfile
# Node 20 Alpine
# Expose port 3335
# Build: tsc
# Start: node dist/index.js
```

**docker-compose**:
```yaml
telegram-bot:
  build: ./services/telegram-bot
  ports: 3335:3335
  environment: [TELEGRAM_BOT_TOKEN, etc]
  depends_on: [agent-brain]
  networks: [hfsp-network]
```

**Acceptance Criteria**:
- Docker builds without errors
- `docker-compose up` starts service
- Service connects to agent-brain
- Health check endpoint works (/health → 200)
- Logs are viewable with docker logs

## Commit Message Format

All commits must include LLM prefix:

```
[OPENAI] Implement webhook handler and message parsing

[GEMINI] Add agent-brain client and approval handling

[KIMI] Create Dockerfile and docker-compose configuration

[CLAUDE] Merge and consolidate all implementations
```

## Environment Variables Required

```bash
# Telegram Bot
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_BOT_ID=<numeric ID>
TELEGRAM_SECRET_TOKEN=<random secret for webhook validation>
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/telegram/webhook

# Agent Brain
AGENT_BRAIN_URL=http://localhost:3334  # local dev
AGENT_BRAIN_URL=http://agent-brain:3334  # docker

# Server
PORT=3335
NODE_ENV=development|production
DEBUG=false|true
```

## Integration Points

### With Telegram Bot API
- **Register webhook**: `POST /setWebhook` with secret token
- **Send messages**: `POST /sendMessage` with text and inline buttons
- **Handle updates**: Receive `message` and `callback_query` updates

### With Agent-Brain Service
- **Endpoint**: `POST http://agent-brain:3334/message`
- **Request**: `{ user_id: string, message: string }`
- **Response**: `{ response: string, requiresApproval?: bool, approvalAmount?: number }`

### Docker Network
- Service name: `telegram-bot`
- Network: `hfsp-network` (shared with agent-brain)
- Port: `3335` (internal), `127.0.0.1:3335` (host)

## File Structure

```
packages/agent-provisioning/services/telegram-bot/
├── src/
│   ├── index.ts                    [OPENAI] Main server
│   ├── handlers/
│   │   ├── message.ts              [OPENAI] Message parsing
│   │   └── approval.ts             [GEMINI] Button handling
│   ├── services/
│   │   └── agent-brain-client.ts   [GEMINI] Agent API calls
│   ├── types/
│   │   └── index.ts                [GEMINI] TypeScript types
│   └── utils/
│       ├── logger.ts               [OPENAI] Logging
│       └── telegram-security.ts    [OPENAI] Validation
├── package.json                    [CLAUDE] ✅ Created
├── tsconfig.json                   [CLAUDE] ✅ Created
├── Dockerfile                      [KIMI] Docker image
├── docker-compose.yml              [KIMI] Service config
├── .env.example                    [KIMI] Config template
├── .dockerignore                   [KIMI] Build excludes
└── README.md                       [CLAUDE] Documentation
```

## Development Workflow

### Phase 1: Parallel Development (NOW)
1. Each LLM works in their branch independently
2. Implement files listed in their section
3. Test locally in their branch
4. Create feature PR to main

### Phase 2: Integration (After PRs)
1. Claude reviews all PRs for consistency
2. Ensure no conflicts between implementations
3. Merge in order: OpenAI → Gemini → Kimi
4. Run integration tests

### Phase 3: Testing
1. Local testing with ngrok
2. Docker Compose testing
3. End-to-end Telegram message flow
4. Approval button flow

### Phase 4: Deployment
1. Register webhook with Telegram
2. Deploy to staging VPS
3. Test with real Telegram messages
4. Deploy to production

## Testing Checklist

- [ ] `npm install` succeeds
- [ ] `npm run build` completes without errors
- [ ] `npm run dev` starts server on port 3335
- [ ] GET /health returns 200
- [ ] POST /webhook with invalid signature returns 401
- [ ] POST /webhook with valid signature processes message
- [ ] Agent-brain responds to /message calls
- [ ] Telegram API calls succeed (sendMessage, editMessageText)
- [ ] Buttons appear in Telegram for approval requests
- [ ] Button clicks trigger callbacks
- [ ] docker-compose up starts both services
- [ ] Services communicate on hfsp-network

## Next Steps After Initial Setup

1. **OpenAI**: Implement webhook handler (src/index.ts, handlers/message.ts)
2. **Gemini**: Implement agent integration (services/agent-brain-client.ts, handlers/approval.ts)
3. **Kimi**: Implement Docker infrastructure (Dockerfile, docker-compose.yml)
4. **Claude**: Review, merge, and test all implementations
5. **Team**: Deploy to production and register webhook

## Success Criteria for Milestone 2

- ✅ Telegram users can send messages to hfsp_minibot
- ✅ Messages reach telegram-bot webhook
- ✅ Messages forwarded to agent-brain
- ✅ Agent responses appear in Telegram
- ✅ Spending requests show approval buttons
- ⏳ Users can click approve/reject (needs agent-brain execution)
- ⏳ Approved actions execute (out of scope for this milestone)

## Questions & Blockers

If blocked, post in thread with:
- LLM name and branch
- Specific file/function
- Error message or blocker description

## Resources

- Telegram Bot API: https://core.telegram.org/bots/api
- Telegraf library (optional): https://telegraf.dev/
- Agent-brain service: packages/agent-provisioning/services/agent-brain/
- Docker docs: https://docs.docker.com/
- Previous session context: [check SESSIONS/]
