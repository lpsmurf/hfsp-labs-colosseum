# Clawdrop — Developer Context

## What This Project Is

Clawdrop deploys per-user autonomous Solana AI agents that run 24/7. 

- **Stage 1** — Free trial chatbot (`clawdrop.live/try`): Proof of concept
- **Stage 2** — Paid deployed agent: Private Docker container + MCP server + Telegram interface

Built on **SendAI Solana Agent Kit** (60+ Solana tools, token/DeFi plugins).

---

## Monorepo Structure

```
packages/
├── trial-api                 Trial chatbot backend (Mastra + SendAI Agent Kit)
├── trial-frontend            Trial chatbot UI (React + Vite)
├── clawdrop-mcp-server       Per-user MCP server (SendAI Agent Kit + x402 payment)
├── clawdrop-agent-runtime    Per-user autonomous agent (Telegram + MCP client)
├── clawdrop-platform         Subscriptions, Docker orchestration, ZK vault
├── agent-provisioning        Mastra brain + Telegram wizard + storefront API
├── clawdrop-mcp              MCP gateway + CLI wizard + payment protocol
└── oobe-bounty               (Separate bounty deliverable)
```

---

## Key Architecture Decisions

1. **SendAI Agent Kit is the tool provider, not the agent loop**
   - Tools exposed via MCP adapter (`@solana-agent-kit/adapter-mcp`)
   - Agent orchestration via Mastra (model-agnostic)
   - Reason: Swap LLMs without changing tool definitions

2. **Per-user Docker isolation**
   - Each subscriber gets isolated containers for MCP server + agent runtime
   - Private key injected only at spawn time (AES-GCM encrypted storage)
   - Reason: No key sharing, concurrent safety

3. **x402 payment tools alongside Agent Kit tools in one MCP server**
   - Both types registered in same `actionsRecord`
   - Agent can reason about payments + execution together
   - Reason: Budget awareness built into tool selection

4. **LLM routing, not lock-in**
   - Per-user modes: platform-managed keys, BYOK, custom endpoint
   - Transparent to the tooling layer
   - Reason: Users control their LLM choice

---

## Running Locally

```bash
# Install dependencies
npm install

# Populate .env files (see docs/getting-started/development-setup.md)
cp .env.example .env.trial

# Start with Docker Compose
npm run dev

# Services start on:
# - trial-frontend     http://localhost:3000
# - trial-api          http://localhost:8787
# - clawdrop-platform  http://localhost:8788
```

---

## File Structure for Contributors

- `/packages/*/src/` — Implementation code (TypeScript)
- `/packages/*/tests/` — Unit + integration tests
- `/docs/` — Public documentation, guides, architecture
- `/.github/` — GitHub templates, workflows
- `/config/` — Docker, nginx, PM2, system configs
- `/scripts/` — Deployment, dev, and utility scripts

---

## Before Contributing

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) — commit style, PR process
2. Check [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design
3. Review [docs/getting-started/development-setup.md](docs/getting-started/development-setup.md) — setup issues

---

**Questions?** Check the docs or open an issue.
