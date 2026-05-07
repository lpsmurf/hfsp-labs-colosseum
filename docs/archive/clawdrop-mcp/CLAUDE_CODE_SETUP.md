# Clawdrop MCP - Claude Code Integration

## Quick Start

### Option A: Local MCP Server (Recommended for Dev)

1. **In terminal, start the MCP server:**
```bash
cd /Users/mac/clawdrop-mcp
npm run build
npm start
```

The server will start and listen on stdio. Claude Code will communicate with it automatically.

### Option B: Using Claude Code's Launch Configuration

If you have Claude Code installed:

```bash
# From Claude Code, open the command palette and select:
# "Claude Code: Start Server" → select "clawdrop-mcp"

# Or use the preview_start skill:
# /preview_start clawdrop-mcp
```

---

## Testing the Connection

Once the server is running, you should be able to call these tools in Claude Code:

```
User: "List available Clawdrop services"
→ MCP calls list_services tool
→ Returns 10 services with prices

User: "Quote the Treasury Agent in SOL"
→ MCP calls quote_service tool
→ Returns: 5.005 SOL (5 SOL + 0.005 gas)

User: "I want to deploy the Treasury Agent Pro"
→ MCP calls create_openclaw_agent tool
→ Returns agent ID + console URL

User: "Check the status of agent_xxx"
→ MCP calls get_agent_status tool
→ Returns status + logs
```

---

## Tools Available

The MCP server exposes these tools to Claude Code:

1. **list_services** - Show all 10 available services
2. **quote_service** - Get price for a service (SOL or HERD)
3. **pay_with_sol** - Process payment (simulated on devnet)
4. **create_openclaw_agent** - Deploy a new agent
5. **get_agent_status** - Check agent health + logs

---

## Debugging

View detailed logs while server is running:

```bash
LOG_LEVEL=debug npm start
```

Or check the test script:

```bash
npm run test:tools
```

---

## Environment Variables

For real Helius API integration, add to `.env`:

```bash
HELIUS_API_KEY=your_api_key_here
```

Without it, the server uses realistic fallback prices.

---

## Demo Flow (Friday)

```
1. "List services" → 10 services
2. "Quote Treasury Agent" → 5.005 SOL
3. "Deploy it, my wallet is..." → agent_xxx deployed
4. "Check status" → running, logs visible
```

All in Claude Code terminal! 🚀
