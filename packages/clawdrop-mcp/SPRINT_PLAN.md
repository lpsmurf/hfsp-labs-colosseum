# Clawdrop MCP - Week 1 Sprint (End-of-Week Demo)

## Status: ✅ Critical Path Complete

**Scaffold completed:**
- ✅ MCP server with stdio transport
- ✅ All 5 core tools defined with Zod schemas
- ✅ Service catalog (5 services, prices in SOL/HERD)
- ✅ Logging infrastructure
- ✅ TypeScript + tooling setup
- ✅ Repo pushed to GitHub: https://github.com/lpsmurf/clawdrop-mcp

**Repo is ready for parallel development.**

---

## Parallel Tracks (Days 2-5)

### **Track A: Devnet + Payments (Claude Code)**

**Owner:** Claude Code (current session)  
**Goal:** Real devnet quotes + simulated payments

**Tasks:**
- [ ] Add `@solana/web3.js` and `axios` to dependencies (for Helius calls)
- [ ] Create `src/integrations/helius.ts`:
  - Fetch SOL price from Helius API `/prices` endpoint
  - Cache price for 30 seconds
  - Return `{ sol_price_usd }`
- [ ] Update `quote_service` in `src/server/tools.ts`:
  - Call Helius to get real SOL/HERD prices
  - Calculate total with 0.005 SOL gas fee
- [ ] Update `pay_with_sol` in `src/server/tools.ts`:
  - Build unsigned transaction to a Clawdrop treasury wallet
  - Simulate via Helius RPC (no actual signing yet)
  - Log mock tx hash to file: `src/data/mock-txs.json`
- [ ] Test locally:
  ```bash
  npm run dev
  # In another terminal:
  # Test with MCP client that calls quote_service then pay_with_sol
  ```

**Completion criteria:**
- `quote_service` returns real devnet prices from Helius
- `pay_with_sol` returns mock tx hash with "confirmed" status
- No errors in logs

---

### **Track B: hfsp-agent-provisioning Integration (ChatGPT/Kimi)**

**Owner:** ChatGPT or Kimi Code  
**Goal:** Real agent deployment via hfsp-agent-provisioning API

**Tasks:**
- [ ] Read https://github.com/lpsmurf/hfsp-agent-provisioning docs
  - Understand API endpoints: `POST /agents`, `GET /agents/:id`, `GET /agents/:id/status`
  - Understand agent config shape (model, tools, instructions, etc.)
- [ ] Create `src/integrations/hfsp.ts`:
  - Client to hit HFSP API
  - `deployAgent(config)` → returns `{ agent_id, status, url }`
  - `getAgentStatus(agent_id)` → returns `{ status, logs, uptime, etc. }`
  - Handle errors gracefully (timeouts, 5xx, etc.)
- [ ] Update `create_openclaw_agent` in `src/server/tools.ts`:
  - Parse agent config from tool input
  - Call `hfsp.deployAgent()`
  - Map hfsp response to Clawdrop response schema
- [ ] Update `get_agent_status`:
  - Call `hfsp.getAgentStatus()`
  - Return logs + health info
- [ ] Test locally (if hfsp is running locally at `localhost:3001`):
  ```bash
  # Verify HFSP is running
  curl http://localhost:3001/health
  # Run MCP and call create_openclaw_agent
  ```

**Completion criteria:**
- Agent creation returns real agent_id from hfsp
- Status retrieval returns real agent logs
- Graceful error handling for hfsp failures

---

### **Track C: Service Catalog + Policy Skeleton (Gemini)**

**Owner:** Gemini  
**Goal:** Rich service catalog + placeholder policy engine

**Tasks:**
- [ ] Expand `src/data/services.json` with 10 total services:
  - Keep existing 5 services
  - Add 5 more variations (e.g., "Treasury Agent Pro", "Custom Research Agent", etc.)
  - Each should have realistic pricing and descriptions
- [ ] Create `src/services/policies.ts`:
  - Define policy schema: `{ max_tx_usd, daily_spend_cap, weekly_spend_cap, token_allowlist, etc. }`
  - Stub `checkPaymentPolicy()` → always returns `true` for now
  - Later: this will enforce spend limits
- [ ] Create `src/db/memory.ts`:
  - In-memory store for deployed agents (will be replaced with DB later)
  - Store: `{ agent_id, service_id, payment_tx_hash, deployed_at, owner }`
  - Functions: `saveAgent()`, `getAgent()`, `listAgents()`
- [ ] Add logging to all tools via `src/utils/logger.ts`:
  - Every tool call logs input + output
  - Every error logs with full context
  - Test with: `LOG_LEVEL=debug npm run dev`
- [ ] Create `scripts/seed-services.ts`:
  - Load services from JSON on startup (already done in catalog.ts)
  - Optional: script to generate mock agent data

**Completion criteria:**
- 10 diverse services in catalog
- Policy skeleton compiles
- In-memory agent store working
- All tools produce detailed logs

---

## Integration Checkpoint (End of Day 4)

Once all tracks are done, test the full flow:

```bash
# Setup
npm install
npm run build

# Test in sequence:
# 1. list_services → returns 10 services
# 2. quote_service(treasury-agent) → returns real SOL price from Helius
# 3. pay_with_sol(treasury-agent, 5.0, wallet) → returns mock tx hash
# 4. create_openclaw_agent(service_id, "My Treasury Agent") → deploys to hfsp
# 5. get_agent_status(agent_id) → returns real logs from hfsp
```

---

## Demo Script (Friday)

**In Claude Code terminal:**

```
User: "List available Clawdrop services"
→ [lists 10 services with prices]

User: "Quote the Treasury Agent in SOL"
→ [returns real Helius price + 0.005 gas]

User: "Deploy it. My wallet is So..."
→ [simulates payment, returns tx hash]
→ [calls hfsp, deploys agent]
→ [returns agent URL]

User: "Check the agent status"
→ [returns real logs from hfsp]
```

---

## File Structure (Current)

```
clawdrop-mcp/
├── src/
│   ├── index.ts                    ← Main entry
│   ├── server/
│   │   ├── mcp.ts                 ✅ Done
│   │   ├── tools.ts               ⚠️ Partially done (mock implementations)
│   │   └── schemas.ts             ✅ Done
│   ├── services/
│   │   ├── catalog.ts             ✅ Done
│   │   └── policies.ts            ⏳ Track C
│   ├── integrations/
│   │   ├── helius.ts              ⏳ Track A
│   │   └── hfsp.ts                ⏳ Track B
│   ├── db/
│   │   └── memory.ts              ⏳ Track C
│   ├── utils/
│   │   └── logger.ts              ✅ Done
│   └── data/
│       └── services.json          ✅ Done (needs expansion in Track C)
├── scripts/
│   └── seed-services.ts           ⏳ Track C
├── .env.example                    ✅ Done
├── package.json                    ✅ Done
├── tsconfig.json                   ✅ Done
└── README.md                       ✅ Done
```

---

## Dev Tips

**Build & run:**
```bash
npm install
npm run build
npm run dev         # Watch mode with tsx
npm start          # Run compiled dist/
```

**Debug:**
```bash
LOG_LEVEL=debug npm run dev
```

**Test MCP server locally:**
- Use `npx mcp-test-client` (if available)
- Or write a simple test script that talks to stdio

---

## Blockers & Notes

- **HFSP API:** Verify it's running at `localhost:3001` before Track B starts
- **Helius API key:** Add to `.env` before Track A testing
- **Solana wallet:** Treasury wallet address needed for payment simulation
- **No real payments:** For demo, payments are simulated (logged, not broadcasted)

---

## Post-Demo (Next Phase)

After end-of-week demo:
- Add real payment execution (sign + broadcast to devnet)
- Persist agents to PostgreSQL
- Add Airwallex connected accounts
- Implement real policy engine
- Build Claw Console web dashboard
