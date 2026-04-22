# Agent Provisioning Package

**Purpose**: Complete agent deployment and provisioning system for Clawdrop.

Includes AI agent runtime, Telegram integration, web provisioning UI, and backend API services.

## Services

| Service | Port | Purpose |
|---------|------|---------|
| **agent-brain** | 3334 | Mastra AI agent runtime |
| **telegram-bot** | 3335 | Telegram webhook handler & message processor |
| **clawdrop-wizard** | 5173 | React web UI for agent provisioning |
| **storefront-bot** | 3001 | Backend API for provisioning & agent management |

## Quick Start

```bash
cd packages/agent-provisioning
npm install
docker-compose -f ../../config/docker/docker-compose.yml up
```

Services will be available at:
- Agent Brain: http://localhost:3334
- Telegram Bot: http://localhost:3335
- Wizard UI: http://localhost:5173
- API: http://localhost:3001

## Directory Structure

```
agent-provisioning/
├── services/
│   ├── agent-brain/        Mastra runtime for AI agents
│   ├── telegram-bot/       Telegram webhook handler
│   ├── clawdrop-wizard/    React provisioning UI
│   ├── storefront-bot/     Backend API
│   └── webapp/             Additional web services
├── src/                    Shared utilities
├── tests/                  Test suites
└── spec-kit/              API specifications
```

## Architecture

Each service is independently deployable. See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design.

## Testing

```bash
npm test
npm run integration-test
```

## Contributing

See [../../CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

Code ownership: See [../../.github/CODEOWNERS](../../.github/CODEOWNERS)

## Deployment

See [../../docs/getting-started/deployment.md](../../docs/getting-started/deployment.md)

