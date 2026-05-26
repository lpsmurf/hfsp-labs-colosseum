# Clawdrop

> **"While you sleep, your agent trades."**

Deploy per-user autonomous Solana AI agents that run 24/7, execute DeFi strategies, and interact with 60+ Solana protocols—without users writing code or sharing private keys.

Two stages: free trial chatbot → paid deployed agent on isolated infrastructure.

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](package.json)
[![solana-agent-kit](https://img.shields.io/badge/solana--agent--kit-v2.0.10-9945FF)](https://github.com/sendaifun/solana-agent-kit)
[![MCP](https://img.shields.io/badge/MCP-compatible-orange)](https://modelcontextprotocol.io)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](docker-compose.trial.yml)

---

## Architecture Overview

```
STAGE 1: FREE TRIAL                      STAGE 2: DEPLOYED AGENT
──────────────────────────────────────   ──────────────────────────────────────

User Browser                              User via Telegram
     ↓                                           ↓
trial-frontend (React/Vite)              clawdrop-agent-runtime (per-user)
     ↓                                           ↓ MCP Client
trial-api (Mastra Agent)                 clawdrop-mcp-server (per-user)
     ↓                                           ↓
SolanaAgentKit                           SolanaAgentKit + TokenPlugin + DefiPlugin
  • TokenPlugin                          + x402engine-mcp (payment protocol)
  • MiscPlugin                           + Clawdrop custom tools
  (read-only on devnet)                  (full capabilities on mainnet)
                                          ↓
                                   Helius RPC → Solana Blockchain
                                   Jupiter, Birdeye, DexScreener
```

**Key insight:** Each paid subscriber gets an isolated Docker container running their own `clawdrop-mcp-server` instance—their private key, their dedicated MCP endpoint, never shared infrastructure.

---

## SendAI Agent Kit Integration

Clawdrop makes deep use of **SendAI Solana Agent Kit** as the unified tool provider:

### Trial Chatbot (Stage 1)
- `packages/trial-api` instantiates `SolanaAgentKit` with `TokenPlugin` + `MiscPlugin`
- Tools: token price (Jupiter), wallet balance, domain resolution (.sol), NFT metadata, token safety (RugCheck), Allora inference
- Uses: Mastra agent orchestration for conversational routing
- Scope: read-only devnet access, rate-limited

### Deployed Agent (Stage 2)
- `packages/clawdrop-mcp-server` exposes `SolanaAgentKit` as an MCP server via `@solana-agent-kit/adapter-mcp`
- Tools: all TokenPlugin + DefiPlugin actions (swaps, liquidity, yield, routing)
- Extensibility: custom Clawdrop tools (`list_tiers`, `get_wallet_analytics`, `check_token_risk`) registered in same `actionsRecord` as Agent Kit tools
- Pattern:
  ```typescript
  const agent = new SolanaAgentKit(wallet, RPC_URL, config)
    .use(TokenPlugin)
    .use(DefiPlugin);
  
  const actionsRecord = Object.fromEntries(
    agent.actions.map(a => [a.name, a])
  );
  
  // Extend with custom tools
  for (const tool of clawdropTools) {
    actionsRecord[tool.name] = tool;
  }
  
  const mcpServer = createMcpServer(actionsRecord, agent, {
    name: 'clawdrop-mcp',
    version: '0.1.0'
  });
  ```

### Why This Architecture
- **Agent Kit as tool provider, not agent loop** — Clawdrop uses Mastra for agent orchestration, not LangChain. This allows model-agnostic LLM routing (OpenRouter, custom endpoint, BYOK).
- **x402 payment protocol alongside Agent Kit** — `x402engine-mcp` tools are registered in the same MCP server, giving agents unified budget-aware tool selection.
- **Per-user MCP server isolation** — Each user's MCP server is containerized separately; private keys are AES-GCM encrypted at rest, decrypted only at spawn time.

---

## Packages

```
packages/
├── trial-api              Chatbot backend: Mastra agent routing + SendAI Agent Kit
├── trial-frontend         Chatbot UI: React + Vite + Solana wallet adapters
├── clawdrop-mcp-server    Per-user Solana MCP server (SendAI + x402 + custom tools)
├── clawdrop-agent-runtime Per-user autonomous agent (Telegram + MCP client)
├── clawdrop-platform      Subscriptions, Docker orchestration, ZK credential vault
├── agent-provisioning     Mastra brain + Telegram wizard + storefront API
├── clawdrop-mcp           MCP gateway + CLI wizard + payment protocol
└── oobe-bounty            Ace Data Cloud bounty deliverable
```

---

## Quick Start

### Prerequisites
- Node.js 20+
- Docker Desktop 4.x+
- Git

### Run the Trial Stack

```bash
# Clone repo
git clone https://github.com/lpsmurf/hfsp-labs-colosseum.git
cd hfsp-labs-colosseum

# Set up environment
cp .env.example .env.trial
# Edit .env.trial and add:
#   OPENROUTER_API_KEY=your_api_key
#   HELIUS_API_KEY=your_helius_key

# Install and start
npm install
npm run dev
```

Services start on:

| Service | URL |
|---------|-----|
| Trial Frontend | http://localhost:3000 |
| Trial API | http://localhost:8787 |
| Clawdrop Platform | http://localhost:8788 |
| MCP Server | http://localhost:3002 |

---

## Architecture Decisions

### 1. Per-User MCP Isolation
Each subscriber gets their own Docker container with dedicated `clawdrop-mcp-server`. Their Solana private key is stored AES-GCM encrypted; plaintext is never written to disk. Keys are decrypted only at container spawn time and immediately revoked from the credential broker.

### 2. Agent Kit as Tool Provider, Not Loop
Clawdrop decouples tool definitions (SendAI Agent Kit) from agent execution (Mastra). This allows:
- Swap LLMs without changing tools
- LLM routing (OpenRouter, BYOK, custom endpoint)
- Any language model can control Solana tools

### 3. x402 Payment Protocol Alongside Tools
`x402engine-mcp` tools are registered in the same MCP `actionsRecord` as Agent Kit tools. The agent can reason about payment and execution in one loop: "Check if I have budget, then execute the swap."

### 4. No Shared Key Infrastructure
Unlike centralized custodial agents, Clawdrop never holds user keys in a shared vault. Each user's encrypted key lives only in their credential storage entry; decryption requires a server-side encryption key that is environment-isolated per deployment.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Agent Tools** | SendAI Solana Agent Kit v2.0.10 (TokenPlugin, DefiPlugin, MiscPlugin) |
| **Tool Protocol** | Model Context Protocol (MCP) + @solana-agent-kit/adapter-mcp |
| **Payment** | x402engine-mcp (HTTP 402 payment protocol) |
| **Orchestration** | Mastra (@mastra/core) |
| **LLM Routing** | OpenRouter (multi-provider, model-agnostic) |
| **Blockchain** | @solana/web3.js, @solana/pay, SPL Token, Helius RPC |
| **Messaging** | Telegram (Grammy) |
| **Storage** | SQLite (better-sqlite3), Docker volumes |
| **Infrastructure** | Docker (per-user isolation), Docker Compose |
| **Frontend** | React 18 + Vite + Tailwind |
| **Backend** | Node.js 20 + TypeScript + Express |

---

## Documentation

- **[System Flow](docs/guides/system-flow.md)** — How a deployment request moves through the stack
- **[Architecture](docs/ARCHITECTURE.md)** — Detailed system design, component interactions, ZK vault
- **[Getting Started](docs/getting-started/development-setup.md)** — Local dev setup, troubleshooting
- **[API Reference](docs/API.md)** — REST endpoints, MCP tools, authentication
- **[Design Decisions](docs/design-decisions/technical-innovations.md)** — x402 payment protocol, multi-agent routing, MemPalace, provisioning strategies

---

## Key Features

✅ **One-click agent deployment** via Telegram or web wizard  
✅ **Per-user isolation** — Docker containers + ZK credential vault  
✅ **60+ Solana tools** via SendAI Agent Kit (token, DeFi, misc)  
✅ **Model-agnostic** — Route between Claude, GPT-4, Gemini, etc.  
✅ **BYOK support** — Users bring their own LLM API keys  
✅ **x402 payments** — Dynamic fee collection tied to transaction type  
✅ **Telegram-first UX** — Primary interface for autonomous agents  
✅ **Production-ready** — Deployed on VPS, PM2 process management, Nginx reverse proxy  

---

## Deployment

See [docs/getting-started/deployment.md](docs/getting-started/deployment.md) for:
- PM2 process management
- Docker Compose production setup
- Nginx reverse proxy configuration
- SSL/TLS setup

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- How to pick a task
- Commit message conventions
- PR process
- Code ownership

---

## License

MIT (with Commons Clause) — See [LICENSE](LICENSE)

---

## Support

- **Questions?** Check the [docs](docs/)
- **Found a bug?** [Open an issue](https://github.com/lpsmurf/hfsp-labs-colosseum/issues)
- **Want to contribute?** See [CONTRIBUTING.md](CONTRIBUTING.md)

---

Built with ❤️ on Solana. Powered by **SendAI Solana Agent Kit**.
