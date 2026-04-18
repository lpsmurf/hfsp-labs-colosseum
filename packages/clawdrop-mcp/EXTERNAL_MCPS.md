# External MCPs for Clawdrop

Clawdrop supports composing external MCPs with deployed agents. This document lists available MCPs that can be attached to OpenClaw instances.

## Installed MCPs

### Solana MCP (`solana-mcp-server`)
**Version**: 1.0.1  
**Author**: purplesquirrel  
**Purpose**: Solana blockchain operations (transactions, wallets, SPL tokens, DeFi)

**Tools available**:
- `send_transaction` - Sign and send Solana transactions
- `get_account_info` - Get wallet/account details
- `get_token_balance` - Check SPL token balances
- `swap_tokens` - Execute token swaps on Jupiter
- `transfer_tokens` - Transfer SPL tokens
- `create_token` - Create new SPL tokens
- And more...

**Installation**:
```bash
npm install solana-mcp-server
```

**How to use with deployed agents**:

When a user deploys an agent via Clawdrop, they receive an MCP endpoint. They can then attach external MCPs to extend the agent's capabilities:

```
User's Claude Code:
  ├─ Clawdrop Gateway MCP (tier selection, payment, deployment)
  └─ Deployed Agent's MCP
     ├─ Native treasury tools (balance-monitoring, yield-optimization)
     ├─ Solana MCP (transaction signing, swaps)
     └─ Other MCPs (DeFi, governance, etc.)
```

**Example usage in deployed agent**:
```typescript
// In OpenClaw instance, user can enable Solana MCP
import { SolanaMCP } from 'solana-mcp-server';

const agent = new OpenClawAgent({
  capabilities: [
    'treasury-ops',     // Built-in
    'solana-mcp',       // External MCP
    'jupiter-dex'       // Other external
  ]
});

// Agent can now call Solana tools directly
await agent.callTool('send_transaction', {
  to: recipient,
  amount: 5, // SOL
  memo: 'Payment from agent'
});
```

---

## How External MCPs Work in Clawdrop

### Architecture

```
┌─────────────────────────────────────┐
│  Clawdrop Control Plane (Gateway)   │
│  - list_tiers, quote_tier, etc.     │
└─────────────────────────────────────┘
                  ↓
         ┌────────────────┐
         │ HFSP           │
         │ Provisioning   │
         └────────────────┘
                  ↓
    ┌────────────────────────────────┐
    │ Deployed OpenClaw Agent        │
    │                                │
    │ ┌────────────────────────────┐ │
    │ │ Native Capabilities        │ │
    │ │ (treasury-ops, etc.)       │ │
    │ └────────────────────────────┘ │
    │                                │
    │ ┌────────────────────────────┐ │
    │ │ External MCPs (Attached)   │ │
    │ │ ├─ Solana MCP              │ │
    │ │ ├─ DeFi MCP                │ │
    │ │ └─ Other MCPs              │ │
    │ └────────────────────────────┘ │
    │                                │
    │ User connects Claude Code      │
    │ to this agent's MCP endpoint   │
    │ ↓                              │
    │ Claude can use ALL tools       │
    │ (native + external MCPs)       │
    └────────────────────────────────┘
```

### For Week 2+: Capability Bundle System

The goal is to let users select which MCPs to attach when deploying:

```
User in Claude Code:
  "Deploy treasury-agent-pro with Solana + Jupiter"
  
Clawdrop deploys with:
  ├─ treasury-ops (built-in)
  ├─ solana-mcp (external, user requested)
  └─ jupiter-dex (external, user requested)
```

---

## For Deployed Agents (Week 2)

When implementing agent provisioning, HFSP will:

1. Deploy base OpenClaw container
2. Install requested capability bundles (built-in)
3. Install requested external MCPs (user-selected)
4. Configure MCP discovery
5. Expose single MCP endpoint with all tools

---

## Adding More External MCPs

To add other MCPs:

```bash
# Install the package
npm install @cubie-ai/solana-mcp
npm install some-other-mcp

# Document it in EXTERNAL_MCPS.md
# Add to capability bundle options
```

---

## Current Status

**Phase 1** (This week): Solana MCP installed, documented, ready for Week 2

**Phase 2** (Week 2): 
- [ ] Capability bundle system allows MCP selection
- [ ] HFSP handles MCP attachment during provisioning
- [ ] Deployed agents expose all tools via single MCP endpoint

**Phase 3** (Week 2+):
- [ ] MCP discovery/registry (like Docker Hub)
- [ ] Community-contributed MCPs
- [ ] One-click MCP attachment to existing agents
