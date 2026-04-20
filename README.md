# Clawdrop - Quick Start Guide

Deploy AI agents on Solana in 60 seconds.

---

## 🚀 Option 1: CLI (Fastest / Best for Demo)

### One-line install
```bash
npx github:lpsmurf/hfsp-labs-colosseum
```

### Demo mode (no typing - perfect for video)
```bash
CLAWDROP_DEMO=1 npx github:lpsmurf/hfsp-labs-colosseum
```

### What it does
1. Downloads the repo (~2MB)
2. Installs dependencies on first run (~30s)
3. Starts the API server automatically
4. Runs interactive 6-step deployment:
   - **Step 1**: Select tier (Hobbyist / Production / Enterprise)
   - **Step 2**: Select LLM provider (Anthropic / OpenAI / OpenRouter)
   - **Step 3**: Select payment token (SOL / USDC / HERD / EURC)
   - **Step 4**: Show payment wallet + amount
   - **Step 5**: Auto-detect payment on devnet
   - **Step 6**: Deploy agent + show agent ID

---

## 🌐 Option 2: Web Wizard (Product Feel)

### Run locally
```bash
git clone https://github.com/lpsmurf/hfsp-labs-colosseum.git
cd hfsp-labs-colosseum/packages/agent-provisioning/services/clawdrop-wizard
npm install
npm run dev
```

### Or use the deployed version
The wizard is served as part of the Agent Provisioning stack:
- Backend: `storefront-bot` (port 3001)
- Frontend: `clawdrop-wizard` (port 3003)

### What it does
- Full React UI for agent provisioning
- Connect wallet via Phantom
- Select tier, model, and bundles
- Pay with any Solana token
- Deploy and manage agents visually

---

## 🏗️ Architecture

```
User
├── CLI (npx) ────────→ MCP API (port 3000) ───→ HFSP Provisioning (port 3001)
└── Web Browser ─────→ Wizard UI (port 3003) ───→ HFSP Provisioning (port 3001)
```

### Services
| Service | Port | Role |
|---------|------|------|
| `clawdrop-mcp` | 3000 | MCP server / API / orchestration |
| `storefront-bot` | 3001 | Agent provisioning backend |
| `clawdrop-wizard` | 3003 | React frontend for provisioning |

---

## 💰 Payment Flow (Devnet)

1. User selects **Production** tier + **SOL**
2. CLI shows:
   - Amount: `0.05 SOL`
   - Wallet: `3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw`
3. User sends payment via Phantom
4. CLI auto-detects on-chain via **Helius RPC**
5. Agent deploys immediately

---

## 📹 For Video Recording

### Terminal commands
```bash
# Start all services
npm run start

# Run demo (auto-answers)
CLAWDROP_DEMO=1 npx github:lpsmurf/hfsp-labs-colosseum

# Or interactive
npx github:lpsmurf/hfsp-labs-colosseum
```

### Expected output
```
🐾 Clawdrop - Deploy OpenClaw Agent
═══════════════════════════════════════
📦 [Step 1/6] Which tier?
→ Selecting: 2 (Production)
🤖 [Step 2/6] Which AI model provider?
→ Selecting: 1 (Anthropic)
💰 [Step 3/6] Which payment token?
→ Selecting: 1 (SOL)
📡 [Step 5/6] Watching blockchain...
✓ Payment detected!
🚀 [Step 6/6] Deploying...
✅ Agent Deployed! ID: agent_xxx
```

---

## 🔧 Tech Stack

- **Solana**: Web3.js + Helius RPC (devnet)
- **AI**: Anthropic Claude / OpenAI GPT / OpenRouter
- **Backend**: Express + TypeScript + SQLite
- **Frontend**: React + Vite
- **CLI**: Node.js + HTTP API
- **Deployment**: Docker containers on VPS

---

## 📝 GitHub

[github.com/lpsmurf/hfsp-labs-colosseum](https://github.com/lpsmurf/hfsp-labs-colosseum)

Built for **Colosseum Hackathon 2026** — HFSP Labs
