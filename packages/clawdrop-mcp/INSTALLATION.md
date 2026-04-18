# Clawdrop Installation Guide

**Architecture**:
- **Your Mac** (Local): Clawdrop Control Plane + Web Dashboard
- **Kimi's VPS** (187.124.170.113): Development environment + HFSP Provisioner
- **Hostinger VPS**: Deployed OpenClaw instances

---

## PART 1: Your Local Mac Setup

### Step 1: Clone and Setup Clawdrop Control Plane

```bash
# Navigate to project
cd /Users/mac/clawdrop-mcp

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with credentials
nano .env
# Add:
# HELIUS_RPC_URL=https://devnet.helius-rpc.com/
# HFSP_URL=http://187.124.170.113:3001
# HFSP_API_KEY=<ask Kimi for this>
# LOG_LEVEL=debug
```

### Step 2: Verify Local Setup

```bash
# Build
npm run build

# Run tests
npm test

# Start dev server
npm run dev
# Should see: "MCP Server listening on stdio"
```

### Step 3: Get Solana Devnet Wallet

```bash
# If you don't have solana CLI
brew install solana

# Create a devnet wallet
solana-keygen new --outfile ~/solana-devnet-wallet.json

# Get public key
solana address -k ~/solana-devnet-wallet.json

# Request test SOL from faucet
solana airdrop 10 <your-public-key> --url devnet

# Verify balance
solana balance --url devnet
```

### Step 4: Start Monitoring Kimi's Work

```bash
# In a new terminal, run the monitor
./monitor-kimi.sh

# Output will show every commit Kimi makes with build/test results
```

---

## PART 2: Kimi's Hostinger VPS Setup

**VPS Details**:
- Host: 187.124.170.113
- Access: SSH user@187.124.170.113
- OS: Likely Ubuntu/Debian

### Step 1: SSH into VPS

```bash
# From your Mac, SSH into Kimi's VPS
ssh user@187.124.170.113

# If using key-based auth
ssh -i ~/.ssh/kimi-vps-key user@187.124.170.113

# Verify you're connected
hostname
pwd
```

### Step 2: Clone Clawdrop Repository

```bash
# On Kimi's VPS, clone the repo
cd /home/user  # or appropriate directory
git clone https://github.com/your-org/clawdrop-mcp.git
cd clawdrop-mcp

# Verify Phase 0 is there
ls -la src/{models,contracts,server,integrations,provisioner}
```

### Step 3: Setup Node.js on VPS

```bash
# Check if Node is installed
node --version
npm --version

# If not installed, install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node 18+
nvm install 18
nvm use 18

# Verify
node --version  # Should be v18+
npm --version   # Should be 8+
```

### Step 4: Install Clawdrop Dependencies on VPS

```bash
cd /home/user/clawdrop-mcp

# Install
npm install

# Build
npm run build

# Verify
npm test

# Output should show: "5/5 tests passing"
```

### Step 5: Create .env on VPS

```bash
# On Kimi's VPS
nano /home/user/clawdrop-mcp/.env

# Add:
HELIUS_RPC_URL=https://devnet.helius-rpc.com/
HFSP_URL=http://localhost:3001
HFSP_API_KEY=dev-key-12345
LOG_LEVEL=debug
NODE_ENV=development
```

### Step 6: Setup Git on VPS

```bash
# Configure git for Kimi
git config --global user.name "Kimi"
git config --global user.email "kimi@example.com"

# Add SSH key (if not already set up)
ssh-keygen -t ed25519 -C "kimi@example.com"
cat ~/.ssh/id_ed25519.pub  # Copy this to GitHub/GitLab SSH keys
```

---

## PART 3: Setup HFSP Provisioner on Kimi's VPS

**Note**: HFSP should already exist at `/Users/mac/hfsp-agent-provisioning`

### Step 1: Transfer/Clone HFSP to VPS

**Option A: Clone from repo**
```bash
# On Kimi's VPS
cd /home/user
git clone https://github.com/your-org/hfsp-agent-provisioning.git
cd hfsp-agent-provisioning
npm install
npm run build
```

**Option B: Copy from your Mac**
```bash
# From your Mac, copy HFSP to VPS
rsync -avz /Users/mac/hfsp-agent-provisioning/ user@187.124.170.113:/home/user/hfsp-agent-provisioning/

# Then on VPS:
cd /home/user/hfsp-agent-provisioning
npm install
npm run build
```

### Step 2: Create HFSP .env

```bash
# On Kimi's VPS
nano /home/user/hfsp-agent-provisioning/.env

# Add (example values, adjust for your Hostinger account):
HOSTINGER_API_KEY=your-hostinger-api-key
HOSTINGER_VPS_ACCOUNT=your-account-id
DOCKER_REGISTRY=your-docker-registry
LOG_LEVEL=debug
PORT=3001
```

### Step 3: Start HFSP Provisioner

```bash
# On Kimi's VPS, in HFSP directory
npm run dev

# Should output:
# HFSP Provisioner listening on :3001
# Ready to provision agents
```

### Step 4: Verify HFSP is Accessible

```bash
# From your Mac, test HFSP endpoint
curl -X GET http://187.124.170.113:3001/health

# Should return:
# {"status": "ok", "uptime": ...}
```

---

## PART 4: Networking & Firewall Setup

### On Kimi's VPS (187.124.170.113)

```bash
# Open ports for development
sudo ufw allow 3000  # Clawdrop Control Plane
sudo ufw allow 3001  # HFSP Provisioner
sudo ufw allow 3002  # Status API
sudo ufw allow 22    # SSH

# Or if using Hostinger firewall:
# - Login to Hostinger panel
# - VPS > Firewall
# - Add rules for ports 3000, 3001, 3002
```

### Test Connectivity from Your Mac

```bash
# Test SSH
ssh user@187.124.170.113 echo "Connected!"

# Test HFSP port
curl http://187.124.170.113:3001/health

# Test Clawdrop port (will fail before Kimi starts it)
curl http://187.124.170.113:3000/api/status
```

---

## PART 5: Development Workflow Setup

### Your Mac - Terminal 1: Clawdrop Control Plane

```bash
cd /Users/mac/clawdrop-mcp
npm run dev

# Output:
# ✓ Clawdrop MCP listening on stdio
# Ready for Claude Code connection
```

### Your Mac - Terminal 2: Monitor Kimi

```bash
cd /Users/mac/clawdrop-mcp
./monitor-kimi.sh

# Watches for Kimi's commits and auto-tests
```

### Your Mac - Terminal 3: Integration Testing

```bash
cd /Users/mac/clawdrop-mcp
npm test -- --watch

# Continuous test running
```

### Kimi's VPS - Terminal 1: HFSP Provisioner

```bash
# SSH into VPS
ssh user@187.124.170.113

# Start HFSP
cd /home/user/hfsp-agent-provisioning
npm run dev

# Output:
# HFSP Provisioner listening on :3001
```

### Kimi's VPS - Terminal 2: Development Server

```bash
# In same SSH session, new terminal
ssh user@187.124.170.113

# Start Clawdrop dev
cd /home/user/clawdrop-mcp
npm run dev
```

### Kimi's VPS - Terminal 3: Implementation Work

```bash
# In same SSH session, third terminal
ssh user@187.124.170.113

# Create Task A file (Solana verification)
nano /home/user/clawdrop-mcp/src/integrations/helius.ts

# Then Task B file (HFSP integration)
nano /home/user/clawdrop-mcp/src/provisioner/hfsp-client.ts

# Commit and push
cd /home/user/clawdrop-mcp
git add src/integrations/helius.ts
git commit -m "Add Solana verification via Helius RPC"
git push origin main
```

---

## PART 6: Verification Checklist

### Your Mac

- [ ] Clawdrop Control Plane installed
- [ ] Dependencies: `npm install` successful
- [ ] Build: `npm run build` succeeds
- [ ] Tests: `npm test` shows "5/5 passing"
- [ ] Dev server: `npm run dev` starts cleanly
- [ ] Monitor script: `./monitor-kimi.sh` runs
- [ ] Solana wallet: Has test SOL balance
- [ ] Network: Can SSH to 187.124.170.113

### Kimi's VPS (187.124.170.113)

- [ ] SSH access works
- [ ] Node.js 18+ installed: `node --version`
- [ ] Clawdrop repo cloned
- [ ] Dependencies: `npm install` successful
- [ ] Build: `npm run build` succeeds
- [ ] Tests: `npm test` shows "5/5 passing"
- [ ] HFSP provisioner installed
- [ ] HFSP runs: `npm run dev` in hfsp directory
- [ ] Firewall: Ports 3000, 3001, 3002 open
- [ ] Git configured: `git config user.name`

### Cross-System

- [ ] From Mac: `curl http://187.124.170.113:3001/health` returns OK
- [ ] From VPS: `curl http://localhost:3000/health` (will be running during dev)
- [ ] Monitoring: `./monitor-kimi.sh` detects commits from VPS

---

## PART 7: Troubleshooting

### SSH Connection Issues

```bash
# Check SSH key
ls -la ~/.ssh/

# Test SSH connection
ssh -vvv user@187.124.170.113

# If permission denied:
chmod 600 ~/.ssh/id_rsa
chmod 644 ~/.ssh/id_rsa.pub
```

### Node.js Not Found on VPS

```bash
# On VPS, reload shell
source ~/.bashrc
source ~/.zshrc  # if using zsh

# Or use full path
/home/user/.nvm/versions/node/v18.x.x/bin/npm install
```

### HFSP Port Already in Use

```bash
# On VPS, find what's using port 3001
lsof -i :3001

# Or change HFSP port in .env
HFSP_PORT=3001
HFSP_URL=http://localhost:3002  # in Clawdrop .env
```

### Tests Failing

```bash
# Clear and reinstall
cd /Users/mac/clawdrop-mcp
rm -rf node_modules package-lock.json
npm install
npm test
```

### Git Push Issues

```bash
# On VPS, verify git origin
cd /home/user/clawdrop-mcp
git remote -v

# Should show your GitHub/GitLab URL
# If wrong, update it:
git remote set-url origin https://github.com/your-org/clawdrop-mcp.git
```

---

## PART 8: Quick Start Commands

### Your Mac - One Time Setup

```bash
# 1. Clone this repo (or cd if already there)
cd /Users/mac/clawdrop-mcp

# 2. Install
npm install && npm run build

# 3. Test
npm test

# 4. Create .env
cp .env.example .env
# Edit .env with Helius key, HFSP URL (187.124.170.113:3001)
```

### Your Mac - Daily Development

```bash
# Terminal 1: Start Clawdrop
npm run dev

# Terminal 2: Monitor Kimi's commits
./monitor-kimi.sh

# Terminal 3: Watch tests
npm test -- --watch
```

### Kimi's VPS - One Time Setup

```bash
# SSH to VPS
ssh user@187.124.170.113

# 1. Clone repos
cd /home/user
git clone <clawdrop-repo>
git clone <hfsp-repo>

# 2. Install both
cd clawdrop-mcp && npm install && npm run build
cd ../hfsp-agent-provisioning && npm install && npm run build

# 3. Create .env files
# In clawdrop-mcp: nano .env
# In hfsp-agent-provisioning: nano .env
```

### Kimi's VPS - Daily Development

```bash
# Terminal 1: HFSP
cd /home/user/hfsp-agent-provisioning && npm run dev

# Terminal 2: Clawdrop
cd /home/user/clawdrop-mcp && npm run dev

# Terminal 3: Implementation
cd /home/user/clawdrop-mcp && vim src/integrations/helius.ts
# (edit, save, commit, push)
```

---

## Ready to Start? 

Once everything is installed:

1. **Your Mac**: `npm run dev` + `./monitor-kimi.sh`
2. **Kimi's VPS**: `npm run dev` (HFSP) + `npm run dev` (Clawdrop)
3. **Kimi**: Start on Task A (Solana verification)
4. **You**: Watch monitor script for real-time progress

**Friday demo is 2 days away.** Let's ship it! 🚀
