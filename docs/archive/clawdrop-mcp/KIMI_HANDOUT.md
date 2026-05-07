# Kimi: Quick Start Handout

## What You're Building (30 seconds)

Clawdrop is an MCP gateway that lets users deploy crypto agents. You're making it **real**:

```
User: "Deploy treasury agent"
  ↓
You (Task A): Verify their Solana payment on-chain ✅
  ↓
You (Task B): Tell HFSP to provision the agent ✅
  ↓
Result: User has a running agent they can use
```

**By Friday**: Deployments work end-to-end. You're the critical path.

---

## Setup (5 minutes)

```bash
cd /Users/mac/clawdrop-mcp

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Add your Helius API key and HFSP credentials
# (ask for these)

# Start development server
npm run dev

# In another terminal, start HFSP
cd /Users/mac/hfsp-agent-provisioning
npm run dev
```

You now have:
- **Clawdrop Control Plane** running on http://localhost:3000
- **HFSP Provisioner** running on http://localhost:3001

---

## Two Tasks: A and B

### Task A: Solana Payment Verification (4 hours)

**File to create**: `src/integrations/helius.ts`

**What to implement**:
```typescript
export async function verifyHeliusTransaction(tx_hash: string): Promise<boolean> {
  // Call Helius RPC devnet
  // Check if tx_hash has status 'confirmed' or 'finalized'
  // Return true/false
}
```

**Why**: Users pay in SOL. You verify they actually paid before provisioning.

**Test it**:
```bash
# Create a real devnet transaction
solana transfer --from keypair.json <recipient> 0.1 --url devnet

# Call verify_payment tool with that tx_hash
curl -X POST http://localhost:3000/tools/verify_payment \
  -H "Content-Type: application/json" \
  -d '{"payment_id": "pay_123", "tx_hash": "YOUR_HASH"}'

# Should show: verified: true
```

---

### Task B: HFSP Integration (3 hours)

**File to create**: `src/provisioner/hfsp-client.ts`

**What to implement**:
```typescript
export async function deployViaHFSP(request: {
  deployment_id: string,
  tier_id: string,
  capability_bundle: string,
  wallet_address: string,
  // ...
}): Promise<{
  agent_id: string,
  endpoint: string,
  status: string,
  error: string | null
}>
```

**Why**: After payment is verified, HFSP provisions the Docker agent on Hostinger.

**Test it**:
```bash
# Call deploy_openclaw_instance
curl -X POST http://localhost:3000/tools/deploy_openclaw_instance \
  -H "Content-Type: application/json" \
  -d '{
    "tier_id": "treasury-agent-pro",
    "payment_id": "pay_123",
    "agent_name": "my-agent",
    "wallet_address": "YOUR_WALLET"
  }'

# Should return: deployment_id, agent_id, endpoint
```

---

## Key Files (Know These)

**Read (understand the structure)**:
- `src/models/` - Data models (Tier, Payment, Deployment)
- `src/server/schemas.ts` - Tool contracts
- `src/db/memory.ts` - Where data is stored
- `KIMI_DEVELOPER_PACKAGE.md` - Detailed task breakdown

**Create/Modify**:
- `src/integrations/helius.ts` - Create (Solana verification)
- `src/provisioner/hfsp-client.ts` - Create (HFSP calls)
- `src/server/tools.ts` - Modify (wire your code in)

**Reference**:
- `ARCHITECTURE.md` - Full system architecture
- `FRIDAY_DEMO_SCRIPT.md` - What the demo shows
- `PHASE_ALIGNMENT.md` - Timeline and success criteria

---

## Success Criteria (Know This)

**By Thursday**:
- ✅ Real Solana verification works
- ✅ HFSP provisioning calls work
- ✅ Payment → Deployment flow is complete
- ✅ Code compiles, tests pass

**By Friday**:
- ✅ Demo shows: tier → pay SOL → agent deploys
- ✅ User gets real agent endpoint
- ✅ Agent is actually running on Hostinger

---

## Questions? Need Help?

1. **Check the docs first**:
   - Detailed implementation guide: `KIMI_DEVELOPER_PACKAGE.md`
   - Architecture reference: `ARCHITECTURE.md`
   - Troubleshooting: `KIMI_DEVELOPER_PACKAGE.md` (Common Issues section)

2. **If still stuck**:
   - Check logs: `npm run logs`
   - Test individually: Solana alone, HFSP alone
   - Post error message + what you tried

3. **Before Friday demo**:
   - Everything should compile: `npm run build`
   - Tests should pass: `npm test`
   - No console errors in logs

---

## Timeline

**Today (Wed)**:
- 9am-1pm: Task A (Solana verification)
- 2pm-5pm: Task B (HFSP integration)

**Tomorrow (Thu)**:
- 9am-12pm: Full integration + testing
- 1pm-5pm: Refinement, error handling, docs

**Friday**:
- 9am-10am: Smoke test
- 10am-2pm: Demo with your code working

---

## One More Thing

What you're building is the critical path. Without Task A + B:
- Payments aren't verified (could lose money)
- Deployments don't provision (could lose credibility)

**With your code**:
- Users can actually deploy agents
- Friday demo becomes real
- Clawdrop becomes a real product

You're building the foundation. Make it solid.

---

**Start with**: `KIMI_DEVELOPER_PACKAGE.md` for detailed implementation

**Questions**: Check the docs first, then ask

**Let's ship it** 🚀
