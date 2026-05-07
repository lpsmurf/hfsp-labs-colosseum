# Clawdrop MCP - Track Handoff Guide

Use this guide to quickly understand your track, grab the repo, and start building.

---

## Quick Setup (All Tracks)

```bash
# Clone the repo
git clone https://github.com/lpsmurf/clawdrop-mcp.git
cd clawdrop-mcp

# Install & build
npm install
npm run build

# Run in dev mode
npm run dev

# In another terminal, test the MCP server responds
# (You'll need an MCP test client or use Track A's test below)
```

---

## Track A: Devnet + Payments

**Owner:** Claude Code

**Context:**
- User needs real SOL prices from Helius
- Payments are simulated (not signed/broadcast) for now
- Goal: By end of day 3, `quote_service` and `pay_with_sol` hit real APIs

**Quick Tasks:**
1. Add Helius API key to `.env`
2. Create `src/integrations/helius.ts` with:
   - `getSOLPrice()` → calls Helius `/prices` endpoint
   - Simple price cache (30 seconds)
3. Update `src/server/tools.ts`:
   - Make `quote_service` call Helius
   - Add 0.005 SOL gas fee to total
4. Test:
   ```bash
   npm run dev
   # Manually test with MCP client or simple HTTP call
   ```

**Dependencies:**
- `@solana/web3.js` (already in package.json, npm install fetches it)
- Helius API key (get from https://www.helius.dev)

**Reference:**
- Helius API docs: https://www.helius.dev/docs/api

---

## Track B: hfsp-agent-provisioning Integration

**Owner:** ChatGPT or Kimi Code

**Context:**
- HFSP (hfsp-agent-provisioning) is already built
- You need to call its API to deploy agents
- Goal: By end of day 3, `create_openclaw_agent` deploys real agents

**Quick Tasks:**
1. Read https://github.com/lpsmurf/hfsp-agent-provisioning README
   - Understand the API endpoints
   - Understand request/response shapes
2. Create `src/integrations/hfsp.ts` with:
   - HTTP client (use axios, already in package.json)
   - `deployAgent(config)` function
   - `getAgentStatus(agent_id)` function
   - Error handling (timeouts, network errors, etc.)
3. Update `src/server/tools.ts`:
   - Make `create_openclaw_agent` call `hfsp.deployAgent()`
   - Make `get_agent_status` call `hfsp.getAgentStatus()`
4. Test:
   ```bash
   # Verify HFSP is running
   curl http://localhost:3001/health
   # Run MCP and call create_openclaw_agent
   npm run dev
   ```

**Dependencies:**
- HFSP running locally at `localhost:3001` (verify before starting)
- axios (already in package.json)

**Reference:**
- HFSP repo: https://github.com/lpsmurf/hfsp-agent-provisioning
- Axios docs: https://axios-http.com/

---

## Track C: Service Catalog + Policy Skeleton

**Owner:** Gemini

**Context:**
- Service catalog is started (5 services in `src/data/services.json`)
- You need to expand it and add policy infrastructure
- Goal: By end of day 3, catalog has 10 services + policy skeleton

**Quick Tasks:**
1. Expand `src/data/services.json`:
   - Add 5 more services (be creative: "Pro" versions, custom variants, etc.)
   - Each: `id`, `name`, `description`, `category`, `price_sol`, `price_herd`, `deployment_type`
2. Create `src/services/policies.ts`:
   - Define a policy schema (Zod)
   - Stub `checkPaymentPolicy()` → always return `true` for now
   - Add JSDoc comments explaining what fields do
3. Create `src/db/memory.ts`:
   - In-memory agent store (will be replaced with DB later)
   - Functions: `saveAgent()`, `getAgent()`, `listAgents()`
4. Test:
   ```bash
   npm run dev
   # Verify services load
   LOG_LEVEL=debug npm run dev
   # Check logs for service loading
   ```

**Dependencies:**
- zod (already in package.json)
- Nothing else needed

**Reference:**
- Existing schemas: `src/server/schemas.ts`
- Example catalog: `src/data/services.json`

---

## Integration & Demo

Once all tracks are done (end of day 4):

1. **Track A** pushes changes to `main`
2. **Track B** pulls, merges, tests
3. **Track C** pulls, merges, tests
4. **Everyone** tests the full flow together

**Full flow test:**
```bash
npm install
npm run build
npm run dev

# In another terminal or MCP client:
# 1. list_services → 10 services
# 2. quote_service(treasury-agent) → real Helius price
# 3. pay_with_sol(treasury-agent, 5.0, wallet) → mock tx hash
# 4. create_openclaw_agent(service_id, "My Agent") → real agent from HFSP
# 5. get_agent_status(agent_id) → real logs from HFSP
```

**Demo in Claude Code:**
```
User: "List services"
→ MCP lists 10 services

User: "Quote Treasury Agent in SOL"
→ Returns real Helius price

User: "Deploy it"
→ Simulates payment
→ Creates real agent via HFSP
→ Returns agent URL

User: "Check status"
→ Returns real logs from HFSP
```

---

## Questions?

Check:
- `SPRINT_PLAN.md` — detailed sprint breakdown
- Existing code in `src/` — follow the patterns
- GitHub issues — add blockers as issues

Happy shipping! 🚀
