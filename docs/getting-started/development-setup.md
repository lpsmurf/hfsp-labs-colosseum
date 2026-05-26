# Development Setup

## Prerequisites

Ensure you have:

- **Node.js 20+** — `node --version`
- **npm 10+** — `npm --version`
- **Docker Desktop 4.x+** — Running (not just installed), `docker ps`
- **Git** — `git --version`

## Install Dependencies

```bash
cd hfsp-labs-colosseum
npm install
```

The monorepo uses npm workspaces. This installs all package dependencies in one step.

## Environment Files

Copy and populate the `.env` files:

### `.env.trial` (for trial chatbot)
```bash
cp .env.example .env.trial
```

Edit `.env.trial` and add:
```
OPENROUTER_API_KEY=your_openrouter_key_here
HELIUS_API_KEY=your_helius_key_here
PORT=8787
SOLANA_RPC=https://api.devnet.solana.com
```

**Required keys:**
- `OPENROUTER_API_KEY` — Get from https://openrouter.ai (free tier: 2 req/day)
- `HELIUS_API_KEY` — Get from https://helius.dev (free tier: 10k req/month)

### `.env.platform` (for deployed agents)
```
JWT_SECRET=your_jwt_secret_here_min_32_chars
VAULT_ENCRYPTION_KEY=your_vault_key_min_32_chars
HELIUS_API_KEY=your_helius_key
PLATFORM_WALLET_ADDRESS=your_wallet_address
OPENROUTER_API_KEY=optional_for_platform
```

**Required keys:**
- `VAULT_ENCRYPTION_KEY` — Min 32 characters; used to encrypt user private keys

## Running the Trial Stack

```bash
npm run dev
```

This starts all services via `docker-compose.trial.yml`:

| Service | Port | Purpose |
|---------|------|---------|
| trial-frontend | 3000 | React UI |
| trial-api | 8787 | Agent backend |
| clawdrop-platform | 8788 | Subscriptions + Docker API |
| (optional) clawdrop-mcp-server | 3002 | MCP server (manual) |

Wait ~30 seconds for containers to stabilize.

### Verify It Works

```bash
# Check trial API
curl http://localhost:8787/api/health

# Check platform API
curl http://localhost:8788/api/health

# Open frontend
open http://localhost:3000
```

## Running Individual Packages

For development on a specific package:

### Trial API
```bash
cd packages/trial-api
npm run dev
# or
npm run dev:watch
```
Listens on http://localhost:8787

### Trial Frontend
```bash
cd packages/trial-frontend
npm run dev
# or
npm run dev:watch
```
Listens on http://localhost:3000

### Clawdrop Platform
```bash
cd packages/clawdrop-platform
npm run dev
```
Listens on http://localhost:8788

### Clawdrop MCP Server
```bash
cd packages/clawdrop-mcp-server
npm run dev
```
Listens on http://localhost:3002

## Common Setup Problems

### Problem: `npm install` fails with workspace errors
**Solution:** Upgrade npm to 10+
```bash
npm install -g npm@latest
npm install
```

### Problem: Docker containers fail to start
**Solution:** 
1. Verify Docker is running: `docker ps`
2. Check `.env.trial` file exists in project root
3. Look for port conflicts (3000, 8787, 8788, 3002)

```bash
lsof -i :3000   # Check if port is in use
```

### Problem: `SOLANA_RPC` connection errors in logs
**Solution:** The free Helius RPC might be rate-limited. In `.env.trial`, add a different devnet RPC:
```
SOLANA_RPC=https://api.devnet.solana.com
```

Or use a paid Solana RPC (Quicknode, Alchemy, etc.).

### Problem: Playwright browser not found
**Solution:** 
```bash
npx playwright install chromium
```

### Problem: MCP server won't start with "SolanaAgentKit failed to initialize"
**Solution:** The `SOLANA_PRIVATE_KEY` is missing or invalid. For development, generate a keypair:
```bash
solana-keygen new --no-bip39-passphrase --outfile /tmp/dev-keypair.json
cat /tmp/dev-keypair.json | jq -r '.[]' | tr '\n' ',' | sed 's/,$//'
```
Then set `SOLANA_PRIVATE_KEY=...` in your `.env` file.

## Building

Build all packages:
```bash
npm run build
```

Build a single package:
```bash
cd packages/trial-api && npm run build
```

## Testing

Run all tests:
```bash
npm run test
```

Run tests for one package:
```bash
cd packages/trial-api && npm run test
```

Watch mode (auto-rerun on file change):
```bash
npm run test:watch
```

## Linting and Type Checking

```bash
npm run lint      # ESLint
npm run typecheck # TypeScript
```

## Next Steps

- Read [docs/ARCHITECTURE.md](../ARCHITECTURE.md) to understand the system
- Read [docs/API.md](../API.md) for API endpoint reference
- See [CONTRIBUTING.md](../../CONTRIBUTING.md) for code contribution guidelines

---

**Stuck?** Check the [docs](../) or open an [issue](https://github.com/lpsmurf/hfsp-labs-colosseum/issues).

