# Agent Brain — Clawdrop Mastra Service

Self-aware agent powered by Mastra. Reads a Self-Manifest at boot, knows its identity, wallet, and skills.

## Quick Start

### Local Development (requires Node 22+)

```bash
# Install
npm install

# Boot on port 3334
npm run dev
```

### Initialize Agent (curl)

```bash
# Load the test manifest
curl -X POST http://localhost:3334/initialize \
  -H "Content-Type: application/json" \
  -d @src/test-manifest.json

# Get system prompt
curl http://localhost:3334/manifest | jq '.system_prompt'

# Send a message
curl -X POST http://localhost:3334/message \
  -H "Content-Type: application/json" \
  -d '{"user_id": "telegram:123", "message": "Book me a flight to Miami"}'
```

### Docker

```bash
# Build
docker build -t clawdrop-agent-brain:latest .

# Run
docker run -p 3334:3334 \
  -e OPENAI_API_KEY=sk_... \
  -e HELIUS_API_KEY=... \
  clawdrop-agent-brain:latest

# Initialize via Docker
docker exec <container> curl -X POST http://localhost:3334/initialize \
  -H "Content-Type: application/json" \
  -d @src/test-manifest.json
```

## API Endpoints

### POST /initialize
Boot agent with self-manifest. Validates against schema.

**Request**:
```json
{
  "identity": { "name": "Poli", ... },
  "wallet": { ... },
  "skills": [ ... ],
  "user_channels": [ ... ]
}
```

**Response**:
```json
{
  "status": "initialized",
  "agent_name": "Poli",
  "deployment_id": "ocl_dev_poli_001",
  "system_prompt": "You are Poli..."
}
```

### POST /message
Send user message, get agent response.

**Request**:
```json
{
  "user_id": "telegram:123456",
  "message": "Can you help me book a trip?"
}
```

**Response**:
```json
{
  "response": "I'm Poli! I can help with travel, DAO setup, or trading...",
  "requiresApproval": false
}
```

### GET /status
Check agent readiness and available skills.

### GET /manifest
View agent's system prompt and manifest.

### GET /health
Health check.

## Architecture

```
agent-brain (Mastra HTTP service)
├── types/
│   └── manifest.ts    (Zod schemas for self-manifest)
├── services/
│   └── mastra-agent.ts (PoliAgent reads manifest at boot)
├── handlers/
│   └── message.ts     (User message routing + spending checks)
└── index.ts           (Express HTTP server)
```

## Next Steps

1. **Wire Claude API** — Replace placeholder responses in message.ts with Claude 4.6 LLM
2. **Add MCP Tool Registration** — Connect clawdrop-mcp tools to Mastra agent
3. **Wire Telegram Bridge** — hfsp_minibot sends messages to /message endpoint
4. **Add Approval Gates** — Spending checks + Telegram buttons for >$100 approvals
5. **Deploy to VPS** — Docker Compose entry for agent-brain on 72.62.239.63

## Key Files

- **src/types/manifest.ts** — Zod schema for self-awareness injection
- **src/services/mastra-agent.ts** — PoliAgent (reads manifest, generates system prompt)
- **src/test-manifest.json** — Example manifest for local testing
- **Dockerfile** — Node 22 Alpine, ready for production
