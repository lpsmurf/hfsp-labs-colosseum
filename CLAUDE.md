# HFSP Labs Colosseum — Developer Context

## What This Project Is

Two product families live in one monorepo:

- **Clawdrop** — per-user autonomous Solana AI agents running 24/7. Stage 1: free trial chatbot (`clawdrop.live/try`). Stage 2: paid deployed agent (private Docker container + MCP server + Telegram interface), built on **SendAI Solana Agent Kit**.
- **x402 ecosystem** — x402-gated paid APIs (USDC on Solana, Base and Celo), the security audit service, and shared payment tooling.

---

## Monorepo Structure

```
packages/
├── trial-api                 Trial chatbot backend (Mastra + SendAI Agent Kit)
├── trial-frontend            Trial chatbot UI (React + Vite)
├── clawdrop-mcp-server       Per-user MCP server (Agent Kit + x402 payment)
├── clawdrop-agent-runtime    Per-user autonomous agent (Telegram + MCP client)
├── clawdrop-platform         Subscriptions, Docker orchestration, ZK vault
├── agent-provisioning        Mastra brain + Telegram wizard + storefront API
├── clawdrop-mcp              MCP gateway + CLI wizard + payment protocol
├── clawdrop-landing          Landing page
├── clawdrop-vpn              VPN x402 payment integration (clawdrop HTTP proxy)
├── agent-kit-mcp-adapter     Agent Kit → MCP tool adapter
├── oobe-bounty               OOBE Protocol bounty — autonomous x402 agent
├── x402-common               Shared x402 V2 building blocks (@hfsp/x402-common)
├── x402-audit-api            x402 ecosystem security audit API (Base + Solana + Celo)
├── x402-donate               x402-gated donation router (Base, Endaoment)
├── x402-store                Cryptorefills proxy — gift cards/top-ups (Solana + Celo rails)
├── x402-wallet               x402 wallet UI + agent dashboard (Next.js)
├── x402-vpn-vps              x402 VPN + ephemeral VPS — Solana mainnet, Helius verification
├── x402-vpn-vps-base         x402 VPN + ephemeral VPS — Base mainnet, x402.org facilitator
├── celo-commerce-mcp         MCP server for buying top-ups over x402 on Celo
├── gnosis-card-x402          Gnosis Card x402 payment integration
├── gnosis-card-contracts     Gnosis Card Solidity contracts
├── prop-pool                 txoracle-settled prop pools (Anchor + crank + Mini App)
├── wdk-solana-swap           WDK community module — Jupiter swaps on Solana
└── wdk-tron-swap             WDK community module — SunSwap on Tron

config/                       Deployment infrastructure configs
├── vps/                      Server infra (nginx, PM2, systemd) for production VPS
├── pm2/                      PM2 ecosystem files (Mac Mini production)
├── docker/                   Docker configs
└── nginx/                    Nginx reverse proxy configs

marketplace/                  Marketplace submissions (pay-skills, x402scan, Agentic Market)
prep-kits/                    Spec handoff packs for agent-built skills (bridge, scheduled payments)
skills/                       Agent skills
x402-audit/                   Security audit findings for the x402 ecosystem
├── findings/                 Vulnerability disclosures (CRITICAL → INFO)
├── reports/                  Raw sweep data (JSON)
├── archive/                  Historical probe data (LFS)
└── scripts/                  Standalone probe/eval scripts (own lockfile)
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

3. **`@hfsp/x402-common` is the shared payment layer**
   - CAIP-2 networks, USDC amounts, facilitator-backed resource servers
   - Consumers resolve it from `dist/` — build it before typecheck/test (CI does)
   - Nested backends (`*/backend`) build against the hoisted root install

4. **x402 payment tools alongside Agent Kit tools in one MCP server**
   - Budget awareness built into tool selection

5. **LLM routing, not lock-in**
   - Per-user modes: platform-managed keys, BYOK, custom endpoint

---

## Running Locally

```bash
# Install dependencies (root workspaces)
npm install

# Populate .env files (see docs/getting-started/development-setup.md)
cp .env.example .env.trial

# Start the trial stack with Docker Compose
npm run dev

# Services start on:
# - trial-frontend     http://localhost:3000
# - trial-api          http://localhost:8787
# - clawdrop-platform  http://localhost:8788
```

Before typecheck/test, build the shared package once:

```bash
npm run build --workspace=packages/x402-common
```

---

## File Structure for Contributors

- `/packages/*/src/` — Implementation code (TypeScript)
- `/packages/*/tests/` — Unit + integration tests
- `/docs/` — Public documentation, guides, architecture
- `/.github/workflows/` — CI (typecheck, lint, test, build matrix) + CodeQL
- `/.github/dependabot.yml` — grouped security updates only
- `/config/` — Docker, nginx, PM2, system configs
- `/scripts/` — Deployment, dev, and utility scripts
- `/prep-kits/` — Spec packs for skills built by coding agents
- `/marketplace/` — Marketplace submissions
- `/x402-audit/` — Security audit findings and reports

---

## Before Contributing

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) — commit style, PR process
2. Check [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design
3. Review [docs/getting-started/development-setup.md](docs/getting-started/development-setup.md)
4. Never commit `.env*` files, keypairs, or `packages/prop-pool/.devnet-wallet.json`. `main` is protected: required checks must pass and review conversations must be resolved.
