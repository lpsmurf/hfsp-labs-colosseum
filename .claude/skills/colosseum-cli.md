# Colosseum CLI Commands & Service Management

**Metadata**: CLI commands reference, service management, deployment procedures  
**Activation Triggers**: "CLI", "command", "script", "deployment", "docker", "docker-compose", "run locally", "setup", "start services", "session-closer", "summary", "health check", "status"  
**Token Cost**: ~80 tokens (metadata only), ~300 tokens (full content)

---

## 1. Local Development Setup

### Install Dependencies (All Services)

```bash
# Root setup
npm install

# Install each service's dependencies
cd packages/agent-provisioning/services/agent-brain
npm install

cd ../telegram-bot
npm install

cd ../../../packages/clawdrop-mcp
npm install
```

### Development Mode (Hot Reload)

Each service watches for file changes and rebuilds:

```bash
# Terminal 1: Agent Brain (port 3334)
cd packages/agent-provisioning/services/agent-brain
npm run dev

# Terminal 2: Telegram Bot (port 3335)
cd packages/agent-provisioning/services/telegram-bot
npm run dev

# Terminal 3: Clawdrop MCP (port 3001)
cd packages/clawdrop-mcp
npm run dev
```

### Port Mapping Reference

| Service | Port | URL | Health Check |
|---------|------|-----|--------------|
| Agent Brain | 3334 | http://localhost:3334 | GET /health |
| Telegram Bot | 3335 | http://localhost:3335 | GET /health |
| Clawdrop MCP | 3001 | http://localhost:3001 | GET /health |
| Frontend (Vite) | 5173 | http://localhost:5173 | Running build |

---

## 2. Session-Closer Commands

Session-closer generates end-of-session summaries and auto-commits to git.

### Bash Version (Quick)

```bash
# Run with default values (current time, 8 hours back)
./scripts/session-closer.sh

# Specify session date
AGENT_NAME=Claude SESSION_DATE=2026-04-23 ./scripts/session-closer.sh
```

**Output**: Creates `SESSIONS/2026-04-23-dev-session.md` with summary

### TypeScript Version (Full Features)

```bash
# Install ts-node if needed
npm install -g ts-node typescript

# Run with defaults
npx ts-node scripts/session-closer/session-closer.ts

# Specify hours back
npx ts-node scripts/session-closer/session-closer.ts --hours 12

# Specify output file
npx ts-node scripts/session-closer/session-closer.ts --output SESSIONS/custom.md

# Skip git commit
npx ts-node scripts/session-closer/session-closer.ts --no-commit
```

**Auto-Commits**: By default, creates a commit with `[SESSIONS]` prefix. Can be disabled with `--no-commit`.

---

## 3. Docker Commands

### Build Services

```bash
# Build all services (from docker-compose.yml directory)
docker compose build

# Build without cache (forces rebuild)
docker compose build --no-cache

# Build specific service
docker compose build agent-brain
docker compose build telegram-bot
```

### Run Services

```bash
# Start all services in background
docker compose up -d

# Start with rebuild
docker compose up --build -d

# View logs (all services)
docker compose logs

# Tail logs for specific service
docker compose logs -f agent-brain
docker compose logs -f telegram-bot

# Stop all services
docker compose down

# Stop and remove volumes
docker compose down -v

# Restart services
docker compose restart
```

### Check Service Status

```bash
# List all running services
docker compose ps

# Example output:
# NAME               IMAGE                    STATUS
# hfsp-agent-brain   telegram-bot-agent-brain Up 2 seconds (health: starting)
# hfsp-telegram-bot  telegram-bot-telegram-bot Up 2 seconds (health: starting)
```

### Docker Cleanup

```bash
# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune

# Remove unused networks
docker network prune

# Full cleanup (all unused resources)
docker system prune -a --volumes -f
```

---

## 4. Service Health Checks

Quick verification that services are running:

```bash
# Agent Brain
curl http://localhost:3334/health | jq .

# Expected response:
# {
#   "status": "ok",
#   "service": "agent-brain",
#   "timestamp": "2026-04-23T12:34:56.789Z",
#   "uptime": 123.456
# }

# Telegram Bot
curl http://localhost:3335/health | jq .

# Expected response:
# {
#   "status": "healthy",
#   "service": "telegram-bot",
#   "timestamp": "2026-04-23T12:34:56.789Z"
# }

# Clawdrop MCP
curl http://localhost:3001/health | jq .

# Expected response:
# {
#   "status": "ok",
#   "version": "1.0.0",
#   "enabled_features": ["swap", "transfer", "booking"]
# }
```

---

## 5. npm Scripts Reference

Every service has standard npm scripts:

```bash
# Development with hot reload
npm run dev

# Build TypeScript to JavaScript
npm run build

# Start production server (runs compiled JavaScript)
npm run start

# Run type checking
npm run type-check

# Run tests (if configured)
npm test

# Lint code (if eslint is installed)
npm run lint
```

### Example: Building Agent Brain

```bash
cd packages/agent-provisioning/services/agent-brain

# Compile TypeScript to dist/
npm run build

# Output: 
# > tsc
# (compiles all .ts files in src/ to .js in dist/)

# Start compiled server
npm run start
# Output:
# > node dist/index.js
# {"level":"info","time":1776949149520,"msg":"Agent Brain listening","port":"3334"}
```

---

## 6. Clawdrop MCP CLI Commands

CLI commands for managing payments and tiers:

```bash
# List available tiers
npx @clawdrop/cli list-tiers

# Example output:
# Tier | Min Requests | Max Requests | Base Fee | %Fee
# basic | 0 | 100 | $5 | 0%
# pro | 101 | 1000 | $20 | 0.5%
# enterprise | 1001 | unlimited | $100 | 0.1%

# Get pricing quote for operation
npx @clawdrop/cli quote-tier --operation swap --amount 1000

# Example output:
# Operation: swap
# Amount: 1000
# Base Fee: $50
# Percentage Fee: $5 (0.5% of 1000)
# Total Fee: $55
# Net Amount: $945

# Verify payment was recorded
npx @clawdrop/cli verify-payment --tx-id tx_abc123

# Example output:
# Transaction ID: tx_abc123
# Status: success
# Amount: 1000
# Fee Paid: $55
# Timestamp: 2026-04-23T12:34:56.789Z

# Estimate fee for transaction
npx @clawdrop/cli estimate-fee --amount 5000 --operation transfer

# Example output:
# Operation: transfer
# Amount: 5000
# Estimated Fee: $150
# Your Tier: pro
```

---

## 7. Deployment Flow (7 Steps)

Follow this checklist when deploying Colosseum to a new environment:

### Step 1: Clone & Setup Code
```bash
git clone https://github.com/lpsmurf/hfsp-labs-colosseum.git
cd hfsp-labs-colosseum
npm install
```

### Step 2: Install Dependencies Per Service
```bash
cd packages/agent-provisioning/services/agent-brain && npm install
cd ../telegram-bot && npm install
cd ../../../packages/clawdrop-mcp && npm install
```

### Step 3: Set Environment Variables
```bash
# Create .env files for each service
cp packages/agent-provisioning/services/agent-brain/.env.example .env

# Edit and configure:
# - TELEGRAM_BOT_TOKEN (from @BotFather)
# - TELEGRAM_SECRET_TOKEN (generate: openssl rand -hex 32)
# - AGENT_BRAIN_URL (for Docker: http://agent-brain:3334)
# - Port mappings
# - LOG_LEVEL for debugging
```

### Step 4: Build Services
```bash
# Build Docker images
docker compose build

# Verify build succeeded (no errors in output)
```

### Step 5: Run Health Checks
```bash
# Start services
docker compose up -d

# Wait 5 seconds for services to start
sleep 5

# Run health checks
curl http://localhost:3334/health
curl http://localhost:3335/health
curl http://localhost:3001/health

# All should return status: "ok" or "healthy"
```

### Step 6: Seed Initial Data (Optional)
```bash
# If using MemPalace, initialize database
npx @clawdrop/cli init-db

# Load initial tiers
npx @clawdrop/cli seed-tiers
```

### Step 7: Start Monitoring
```bash
# Monitor logs
docker compose logs -f

# Or individually:
docker compose logs -f agent-brain &
docker compose logs -f telegram-bot &
docker compose logs -f clawdrop-mcp &
```

---

## 8. Database Management

### MemPalace Initialization

```bash
# Initialize MemPalace knowledge graph
npx @clawdrop/cli init-mempalace

# Seed with sample transactions
npx @clawdrop/cli seed-transactions --count 10

# Backup transaction history
npx @clawdrop/cli backup-db --output backup-2026-04-23.json

# Restore from backup
npx @clawdrop/cli restore-db --input backup-2026-04-23.json
```

### Check Database State

```bash
# List all tables
npx @clawdrop/cli list-tables

# Count transactions
npx @clawdrop/cli count --table transactions

# Export data
npx @clawdrop/cli export --table transactions --format json > transactions.json
```

---

## Common Workflows

### Full Local Development Setup

```bash
# 1. Clone
git clone https://github.com/lpsmurf/hfsp-labs-colosseum.git
cd hfsp-labs-colosseum

# 2. Install
npm install

# 3. Setup Docker
docker compose build

# 4. Start services
docker compose up -d

# 5. Verify health
curl http://localhost:3334/health
curl http://localhost:3335/health

# 6. Watch logs
docker compose logs -f

# Done! Services are running
```

### After Making Code Changes

```bash
# If using npm run dev (hot reload):
# Changes auto-compile, just refresh your client

# If using Docker:
docker compose down
docker compose up --build -d
docker compose logs -f

# If only changing TypeScript code (no dependencies):
npm run build
docker compose restart
```

### Generate Session Summary

```bash
# At end of work session
npx ts-node scripts/session-closer/session-closer.ts

# This creates SESSIONS/2026-04-23-dev-session.md
# and auto-commits to git with [SESSIONS] prefix
```

---

## Troubleshooting CLI Commands

### Port Already in Use
```bash
# Find process using port 3334
lsof -i :3334

# Kill process
kill -9 <PID>

# Or change port in .env
PORT=3336 npm run dev
```

### Docker Build Fails
```bash
# Clear cache and rebuild
docker system prune -a
docker compose build --no-cache

# Or for specific service
docker compose build --no-cache agent-brain
```

### npm Install Fails
```bash
# Clear npm cache
npm cache clean --force

# Remove package-lock.json
rm package-lock.json

# Reinstall
npm install
```

---

## Source References

- Service startup: See `package.json` scripts in each service directory
- Session-closer: `scripts/session-closer.sh` and `scripts/session-closer/session-closer.ts`
- Docker setup: `packages/agent-provisioning/services/*/Dockerfile`
- Configuration: All `.env.example` files

