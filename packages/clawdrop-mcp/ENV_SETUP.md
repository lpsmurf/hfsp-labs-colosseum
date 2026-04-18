# Environment Configuration Guide

Setup instructions for .env variables needed for Clawdrop and HFSP integration.

## Critical Variables for Kimi's Phase 1 Work

### HFSP_API_KEY (Required for Task B)

The HFSP_API_KEY authenticates your Control Plane to the HFSP Provisioner.

**Where to get it:**
1. Check your HFSP provisioner configuration (in hfsp-agent-provisioning)
2. If not set, use a test key for development

**For Development (Recommended):**

Use this test key in your .env:
```
HFSP_API_KEY=test-dev-key-12345
```

Then ensure HFSP is configured with the same key. In HFSP provisioner's .env:
```
API_KEY=test-dev-key-12345
```

**Finding Your Actual HFSP_API_KEY:**

Option A: Check HFSP environment
```bash
ssh root@187.124.170.113
cd /Users/mac/hfsp-agent-provisioning
cat .env | grep API_KEY
```

Option B: Check HFSP code for how it validates API keys
```bash
ssh root@187.124.170.113
cd /Users/mac/hfsp-agent-provisioning
grep -r "API_KEY\|api.key\|authorization" src/ --include="*.ts"
```

### HELIUS_API_KEY (Required for Task A)

The Helius API key for Solana devnet RPC calls.

**Get a free key:**
1. Go to https://www.helius.dev/
2. Sign up for free (includes devnet)
3. Create an API key
4. Copy it to .env: `HELIUS_API_KEY=<your_key>`

**Or use the free RPC endpoint (no key needed):**
```
HELIUS_RPC_URL=https://devnet.helius-rpc.com/
```

The code uses the URL directly, not an API key for RPC calls.

## Setting Up .env

### Step 1: Create Your .env File

```bash
cd /Users/mac/clawdrop-mcp
cp .env.example .env
```

### Step 2: Fill in Required Variables

Edit `.env` and provide:

```bash
# Solana / Devnet
SOLANA_RPC_URL=https://api.devnet.solana.com

# Helius API (optional - code uses free endpoint by default)
HELIUS_API_KEY=

# HFSP Agent Provisioning (REQUIRED FOR TASK B)
HFSP_API_URL=http://localhost:3001
HFSP_API_KEY=test-dev-key-12345  # Coordinate with Kimi on HFSP

# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug
```

### Step 3: Verify HFSP Configuration

Before Kimi starts Task B, both systems must have matching API keys:

**On your Mac (Clawdrop):**
```bash
cat /Users/mac/clawdrop-mcp/.env | grep HFSP_API_KEY
# Output: HFSP_API_KEY=test-dev-key-12345
```

**On Kimi's VPS (HFSP Provisioner):**
```bash
ssh root@187.124.170.113
cat /Users/mac/hfsp-agent-provisioning/.env | grep API_KEY
# Output should match: API_KEY=test-dev-key-12345
```

If they don't match, Kimi's deployment calls will fail with "Unauthorized".

## Quick Setup Script

If you want automated setup (asks for values):

```bash
#!/bin/bash
cd /Users/mac/clawdrop-mcp

echo "Setting up .env..."
cp .env.example .env

# Prompt for key values
read -p "HFSP_API_KEY (test key default: test-dev-key-12345): " HFSP_KEY
HFSP_KEY=${HFSP_KEY:-test-dev-key-12345}

read -p "HELIUS_API_KEY (optional, press enter to skip): " HELIUS_KEY

# Update .env
sed -i '' "s|HFSP_API_KEY=.*|HFSP_API_KEY=${HFSP_KEY}|" .env
[ -n "$HELIUS_KEY" ] && sed -i '' "s|HELIUS_API_KEY=.*|HELIUS_API_KEY=${HELIUS_KEY}|" .env

echo "✅ .env configured"
echo "HFSP_API_KEY: $HFSP_KEY"
echo "🔄 Share HFSP_API_KEY with Kimi: $HFSP_KEY"
```

## Coordinating With Kimi

### Before Kimi Starts Task B:

1. **You (Control Plane on Mac):**
   - Decide on HFSP_API_KEY value (or use test-dev-key-12345)
   - Update your .env with that key
   - Commit to repo

2. **Kimi (HFSP Provisioner on VPS):**
   - Pull the latest from repo
   - Set HFSP_API_KEY to the same value in his .env
   - Restart HFSP service
   - Confirm via: `curl -H "Authorization: Bearer test-dev-key-12345" http://localhost:3001/health`

3. **Verification:**
   ```bash
   # Your Mac
   cat /Users/mac/clawdrop-mcp/.env | grep HFSP_API_KEY
   
   # Should match Kimi's VPS
   ssh root@187.124.170.113 "cat /Users/mac/hfsp-agent-provisioning/.env | grep API_KEY"
   ```

## Common Errors

### "HFSP deployment failed: Unauthorized"
- HFSP_API_KEY mismatch between Control Plane and HFSP
- Check both .env files have same key
- Restart HFSP service on VPS

### "getSignatureStatuses: Invalid Public Key"
- Helius endpoint issue (not API key issue)
- Try: `curl https://devnet.helius-rpc.com/`
- Check HELIUS_RPC_URL is correct in code

### ".env file not found"
- Create it: `cp .env.example .env`
- Then edit with your values

## Testing the Setup

After .env is configured:

```bash
# Test Helius RPC connectivity
npm run test

# Test HFSP connectivity
curl -H "Authorization: Bearer test-dev-key-12345" http://localhost:3001/health

# Check env vars are loaded
node -e "console.log(process.env.HFSP_API_KEY)"
```

## Files to Commit

Once .env is set up locally (you), communicate it to Kimi:

```bash
git status  # .env should be listed as untracked

# Option A: Commit .env with test values (shared repo)
git add .env
git commit -m "config: add .env with test API keys for development"

# Option B: Keep .env local only (add to .gitignore)
echo ".env" >> .gitignore  # Only if not already there
```

For Phase 1 (development), Option A is fine. For production, use .gitignore and manage secrets separately.
