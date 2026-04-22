# Clawdrop — AI Agent Provisioning on Solana

Deploy Mastra-powered AI agents on Solana with one command.

**[For product info, see below](#-product-quick-start). [For developers, start here](#-developer-quick-start).**

---

## 🚀 Developer Quick Start (5 minutes)

### Prerequisites
- Node.js 18+
- Docker & Docker Compose (or local npm setup)
- Git

### Option 1: Docker (Recommended)
```bash
git clone https://github.com/lpsmurf/hfsp-labs-colosseum.git
cd hfsp-labs-colosseum
docker-compose -f config/docker/docker-compose.yml up
```

### Option 2: Local Development
```bash
git clone https://github.com/lpsmurf/hfsp-labs-colosseum.git
cd hfsp-labs-colosseum
npm install
npm run dev
```

Services start on:
- Agent Brain: http://localhost:3334
- Telegram Bot: http://localhost:3335
- Wizard UI: http://localhost:5173
- API: http://localhost:3001

---

## 📚 Developer Documentation

**New to the project?**
- [Getting Started Guide](docs/getting-started/development-setup.md) — Setup, running locally, deployment
- [Architecture Overview](docs/ARCHITECTURE.md) — System design & components
- [API Reference](docs/API.md) — All endpoints & MCP tools

**Contributing?**
- [Contributing Guidelines](CONTRIBUTING.md) — How to submit PRs
- [Code of Conduct](CODE_OF_CONDUCT.md) — Community standards
- [File Ownership Matrix](docs/design-decisions/file-ownership-matrix.md) — Who owns what

**Learning?**
- [Design Decisions](docs/design-decisions/) — Why we built it this way
- [Technical Innovations](docs/design-decisions/technical-innovations.md) — Key technical choices
- [Guides & Tutorials](docs/guides/) — How-tos and examples

**Project Status?**
- [Milestones](docs/milestones/) — Implementation phases
- [Build Status](docs/milestones/current-status.md) — What's done, what's next

---

## 🏗️ Project Structure

```
packages/
├── agent-provisioning/     Agent deployment & provisioning
│   ├── services/
│   │   ├── agent-brain/    Mastra AI runtime
│   │   ├── telegram-bot/   Telegram integration
│   │   ├── clawdrop-wizard/ React UI
│   │   └── storefront-bot/ Backend API
│   └── ...
└── clawdrop-mcp/          MCP protocol server

config/
├── docker/                Docker configs
├── nginx/                 Web server
├── pm2/                   Process manager
└── system/               System configs

docs/
├── getting-started/       Setup & deployment guides
├── architecture/         System design
├── guides/              Tutorials & how-tos
├── design-decisions/    Technical decisions
├── milestones/         Project phases
└── session-reports/    Work summaries

scripts/
├── setup/              Installation
├── deployment/        Production deployment
├── testing/          Test automation
└── monitoring/       Health checks
```

See [docs](docs/) for complete documentation.

---

## 🤖 Multi-Agent Development

This project uses a 4-agent parallel development system:

| Agent | Role | Prefix |
|-------|------|--------|
| **Claude** | Orchestration, architecture, integration | `[CLAUDE]` |
| **Codex** | Code quality, audits, testing | `[CODEX]` |
| **Gemini** | Backend APIs, data services | `[GEMINI]` |
| **Kimi** | DevOps, infrastructure, Docker | `[KIMI]` |

Learn more: [Multi-Agent Orchestration](docs/design-decisions/parallel-orchestration.md)

---

## 📦 Key Technologies

- **AI**: Mastra (agent orchestration), Claude API
- **Blockchain**: Solana, Web3.js
- **Backend**: Node.js, Express, TypeScript, SQLite
- **Frontend**: React, Vite
- **Messaging**: Telegram API
- **Deployment**: Docker, PM2, Nginx

---

## 🐛 Issues & Support

- **Found a bug?** → [Create an Issue](https://github.com/lpsmurf/hfsp-labs-colosseum/issues)
- **Need help?** → [Check Troubleshooting](docs/getting-started/troubleshooting.md)
- **Have a question?** → [Start a Discussion](https://github.com/lpsmurf/hfsp-labs-colosseum/discussions)

---

---

# 🚀 Product Quick Start

Deploy AI agents on Solana in 60 seconds.

## Option 1: CLI (Fastest)

### One-line install
```bash
npx github:lpsmurf/hfsp-labs-colosseum
```

### Demo mode (auto-answers all prompts)
```bash
CLAWDROP_DEMO=1 npx github:lpsmurf/hfsp-labs-colosseum
```

What happens:
1. Downloads repo (~2MB)
2. Installs dependencies (~30s)
3. Starts API server automatically
4. 6-step interactive deployment:
   - Tier selection (Hobbyist / Production / Enterprise)
   - LLM provider (Anthropic / OpenAI / OpenRouter)
   - Payment token (SOL / USDC / HERD / EURC)
   - Shows payment wallet & amount
   - Auto-detects payment on devnet
   - Deploys agent + shows agent ID

## Option 2: Web Wizard

```bash
git clone https://github.com/lpsmurf/hfsp-labs-colosseum.git
cd hfsp-labs-colosseum/packages/agent-provisioning/services/clawdrop-wizard
npm install && npm run dev
```

Open http://localhost:5173 in your browser.

## 💰 Payment Flow (Devnet)

1. Select **Production** tier + **SOL**
2. CLI shows wallet address & amount (e.g., 0.05 SOL)
3. Send payment via Phantom wallet
4. CLI auto-detects on Helius RPC
5. Agent deploys immediately

---

## 📄 License

MIT — See [LICENSE](LICENSE)

---

## 🙏 Credits

Built for **Colosseum Hackathon 2026** by HFSP Labs

Made with ❤️ using Mastra + Solana

