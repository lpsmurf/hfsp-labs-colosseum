# Friday Demo Script: Clawdrop MCP Gateway Live

**Duration**: 8 minutes
**Audience**: Team + stakeholders
**Goal**: Show end-to-end deployment from tier selection → payment verification → agent provisioning

---

## Pre-Demo Checklist

- [ ] Clawdrop Control Plane running: `npm run dev` (Terminal 1)
- [ ] HFSP provisioner running: `cd hfsp-agent-provisioning && npm run dev` (Terminal 2)
- [ ] Claude Code open with Clawdrop MCP connected (Claude Code tab)
- [ ] Solana devnet wallet with test SOL
- [ ] Helius API key in .env
- [ ] HFSP API running and responding
- [ ] Test transaction ready (optional, can use mock for demo)

---

## Demo Flow

### 1. Introduction (1 minute)

**What you say**:
> "Clawdrop is an MCP Gateway for deploying crypto agents. Today we're showing the first client: Claude Code.
> 
> The flow is: Select tier → Get price quote → Pay with Solana → Verify on-chain → HFSP provisions agent → Agent is live.
> 
> This is the foundation for our web and CLI clients coming next week."

**Show on screen**: Architecture diagram (ARCHITECTURE.md) - the three-layer model

---

### 2. MCP Connection (1 minute)

**Action**: Open Claude Code

**Show**:
```
Claude Code → Add MCP → "Clawdrop" → Connect
[Shows connection successful]
```

**What Claude knows now**:
- list_tiers
- quote_tier
- verify_payment
- deploy_openclaw_instance
- get_deployment_status

---

### 3. Tier Selection (1 minute)

**Claude**: "Show me available tiers"

**Claude calls**: `list_tiers`

**Response shows**:
```
Available Tiers:
1. Treasury Agent (treasury-ops)
   - Price: 5.0 SOL / 500 HERD
   - Features: balance-monitoring, cash-flow-management, yield-optimization

2. Treasury Agent Pro (treasury-ops-pro)
   - Price: 8.5 SOL / 850 HERD
   - Features: multi-sig-support, advanced-yield-optimization, risk-analytics

3. Travel Crypto Pro (travel-crypto-pro)
   - Price: 2.5 SOL / 250 HERD
   ...
```

**Commentary**: "Clawdrop offers diverse agent tiers. Users pick based on capability needs and budget."

---

### 4. Price Quote (1 minute)

**Claude**: "What does Treasury Agent Pro cost?"

**Claude calls**: `quote_tier` with tier_id="treasury-agent-pro"

**Response**:
```
Treasury Agent Pro Quote:
Price: 8.5 SOL
Estimated Gas: 0.005 SOL
Total: 8.505 SOL
Quote valid for: 5 minutes

Current SOL price: $150 USD
Total cost: ~$1,275 USD
```

**Commentary**: "Real pricing with gas estimation. Users approve the cost before proceeding."

---

### 5. Payment Processing (2 minutes)

**Claude**: "I'm ready to deploy. Let me verify the payment."

**Behind the scenes**:
1. Claude creates a Payment record (payment_id)
2. Claude gets devnet wallet address from user
3. User sends real Solana transaction to payment address

**Show mock transaction** (or real if time permits):
```bash
# User's perspective - they get a payment address
Send 8.505 SOL to: clawdrop_devnet_payment_...
Transaction hash: 4x7y9z2a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4w5x...
```

**Claude calls**: `verify_payment` with tx_hash

**Response** (powered by Kimi's Solana verification):
```
Payment Verified ✅
Payment ID: pay_abc123
Amount: 8.505 SOL ($1,275)
Status: confirmed
Transaction: https://solscan.io/tx/4x7y9z...?cluster=devnet
Verified on-chain: Yes
```

**Commentary**: "Kimi's Solana verification confirms payment on devnet. We never provision without on-chain confirmation."

---

### 6. Deployment (2 minutes)

**Claude**: "Payment confirmed. Deploying Treasury Agent Pro now."

**Claude calls**: `deploy_openclaw_instance` with:
- tier_id: "treasury-agent-pro"
- payment_id: "pay_abc123"
- agent_name: "my-treasury-agent"
- wallet_address: "user's solana wallet"
- region: "us-east"

**Backend flow** (powered by Kimi's HFSP integration):
1. Control Plane verifies payment is confirmed
2. Control Plane calls HFSP API with deployment request
3. HFSP provisions Docker container on Hostinger VPS
4. HFSP returns agent endpoint + credentials

**Response**:
```
Deployment Started ✅
Deployment ID: deploy_xyz123
Agent ID: agent_xyz123
Status: provisioning
Console URL: https://clawdrop.live/agent/deploy_xyz123
MCP Endpoint: clawdrop.live/agents/deploy_xyz123/mcp
Expected ready: 2-3 minutes
```

**Show**: Open console URL in browser to show deployment progress

**Commentary**: "HFSP is provisioning the agent on Hostinger. Once it's running, users can connect Claude Code to the agent's MCP endpoint."

---

### 7. Status Polling (1 minute)

**Claude**: "Check status"

**Claude calls**: `get_deployment_status` (every 10 seconds)

**Status progression**:
```
[10 sec] Status: provisioning
         Log: Pulling Docker image...

[20 sec] Status: provisioning
         Log: Starting container...

[30 sec] Status: provisioning
         Log: Initializing MCP modules...

[40 sec] Status: running ✅
         Log: Agent ready
         Uptime: 5 seconds
         Endpoint: https://agent-xyz.clawdrop.live
```

**Commentary**: "Real-time status tracking. Once running, the agent is immediately usable."

---

### 8. Post-Deployment (Optional, if time)

**Claude**: "Connect me to the deployed agent"

**Show in Claude Code**:
```
Agent is ready! You can:

1. Connect via MCP:
   Endpoint: clawdrop.live/agents/deploy_xyz123/mcp
   [Ready to add as new MCP]

2. Access via SSH:
   Host: vps-xyz.hostinger.com
   User: agent_user
   Port: 22
   [Full provisioning docs available]

3. Use the Console:
   https://clawdrop.live/agent/deploy_xyz123
```

**Commentary**: "Users have three ways to interact with their deployed agent. Power users SSH in, casual users click the console, and Claude Code users connect the agent's MCP."

---

## Success Criteria for Demo

✅ MCP connects to Claude Code cleanly  
✅ list_tiers shows all 10 tiers with capability bundles  
✅ quote_tier calculates prices correctly  
✅ verify_payment confirms real Solana transaction (or mock convincingly)  
✅ deploy_openclaw_instance returns valid deployment_id  
✅ HFSP integration actually provisions (show in console)  
✅ get_deployment_status tracks real state progression  
✅ Final agent endpoint is valid and documented  

---

## If Something Breaks

**Tool won't call?**
- Check Claude Code MCP connection
- Verify Clawdrop Control Plane is running
- Check logs: `tail -f logs/clawdrop.log`

**Payment verification fails?**
- Check Helius API key
- Verify devnet wallet has SOL
- Look at HFSP logs for issues

**Deployment doesn't provision?**
- Check HFSP is running and responding
- Verify HFSP API key in .env
- Check HFSP logs for provisioning errors

**Status shows error?**
- Check deployment logs in console
- SSH into VPS to see Docker logs
- Review HFSP provisioning output

---

## Demo Talking Points

**Why this matters:**
- Users don't need to know Docker, VPS, or DevOps
- One command (or click, or chat) and they have a deployed agent
- Real Solana verification means real payments
- HFSP integration means real infrastructure
- This is the gateway for three clients (Claude Code, web, CLI)

**What's next (Week 2):**
- Web dashboard for non-technical users
- Terminal CLI for developers
- Agent discovery registry (like Docker Hub)
- Persistence layer (PostgreSQL)

**Friday → Weekend:**
- Kimi finalizes Solana verification
- Kimi finalizes HFSP integration
- You demonstrate the complete flow
- Architecture is battle-tested for scale

---

## Post-Demo

**Talking points if asked**:

*"Why Solana?"* - "Minimal gas fees, devnet for testing, instant verification"

*"How secure is payment?"* - "On-chain verification via Helius. No centralized payment processing."

*"What if HFSP fails?"* - "Payment stays in escrow, deployment marked failed, user notified, retry available"

*"Can users customize their agents?"* - "Yes. SSH access gives full control. They can install custom MCP modules, modify config, etc."

*"How much does it cost to run an agent?"* - "Hostinger VPS varies. Example: $10-30/month for single tier, included in Clawdrop pricing"

---

**You've built the foundation. Today you show it works.**
