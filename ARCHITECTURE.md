# Clawdrop MCP Gateway Architecture

## Overview

Clawdrop is an **MCP Gateway Hub** for deploying and managing crypto agent workflows. Similar to Docker Hub for containers, Clawdrop provides discoverable MCP endpoints that users can connect to from Claude Code, web dashboards, or CLI tools.

## Three-Layer Architecture

```
┌─────────────────────────────────────┐
│   Clawdrop MCP Gateway              │
│   (Discoverable, Multi-client)      │
└────────────┬────────────────────────┘
             │
    ┌────────┼────────┐
    │        │        │
┌───▼──┐ ┌──▼───┐ ┌──▼────┐
│Claude│ │ Web  │ │Terminal│
│Code  │ │ UI   │ │  CLI   │
└──────┘ └──────┘ └────────┘
    │        │        │
    └────────┼────────┘
             │
    ┌────────▼────────────────┐
    │ Clawdrop Control Plane  │
    │ (MCP Tools)             │
    │ • list_tiers            │
    │ • quote_tier            │
    │ • verify_payment        │
    │ • deploy_openclaw_inst  │
    │ • get_deployment_status │
    └────────┬────────────────┘
             │
    ┌────────▼─────────────┐
    │ HFSP Provisioner API │
    │ (Kimi's service)     │
    └────────┬─────────────┘
             │
    ┌────────▼──────────────────┐
    │ Hostinger VPS             │
    │ • OpenClaw Instance 1     │
    │   - MCP Endpoint          │
    │   - SSH Access            │
    │   - Crypto Agent Capability│
    │ • OpenClaw Instance N     │
    │   - MCP Endpoint          │
    │   - SSH Access            │
    │   - Crypto Agent Capability│
    └───────────────────────────┘
```

## Component Descriptions

### Layer 1: MCP Gateway Hub
**Clawdrop Control Plane** - The main MCP endpoint
- Exports 5 core tools (tier management, payment, deployment)
- Discoverable in Claude Code marketplace
- Single endpoint users connect to
- Backend-agnostic (same MCP works via Claude Code, web, CLI)

### Layer 2: Client Interfaces (Priority Order)
1. **Claude Code Client** (Priority 1 - Friday demo)
   - Direct MCP connection
   - User calls tools in Claude chat
   - Most flexible, dev-focused

2. **Terminal CLI Client** (Priority 2 - Week 2)
   - `clawdrop deploy tier-id`
   - Shell-based workflow
   - Hardcore devs

3. **Web Dashboard Client** (Priority 3 - Week 2)
   - Tier gallery, payment UI, status dashboard
   - Newbie-friendly
   - Browser-based management

### Layer 3: Control Plane Backend
**Clawdrop Control Plane MCP Tools:**
- `list_tiers` - Show available tiers + pricing
- `quote_tier` - Get price for specific tier
- `verify_payment` - Confirm Solana devnet transaction
- `deploy_openclaw_instance` - Trigger HFSP deployment
- `get_deployment_status` - Check instance health

**Data Models:**
- Tier (infrastructure + capability options)
- Payment (Solana transaction tracking)
- Deployment (provisioned instance tracking)

### Layer 4: Provisioning
**HFSP Provisioner** - Provisions Docker containers
- Receives deployment requests from Control Plane
- Manages VPS lifecycle on Hostinger
- Returns deployed agent endpoint + credentials

### Layer 5: Deployed Agents
**OpenClaw Instances** - Customer's running agent
- Each gets unique MCP endpoint
- Has built-in crypto/utility capabilities
- Accessible via:
  - **MCP Endpoint** (primary) - Connect Claude Code to agent
  - **SSH Access** (secondary) - Direct VPS access for customization
  - **Provisioning Docs** - Full setup details

## User Journeys

### Journey 1: Claude Code (Priority 1)
```
1. User opens Claude Code
2. Click: Add MCP → Search "Clawdrop" → Connect
3. User in chat: "Show me tiers"
4. Claude calls list_tiers → displays options
5. User: "Deploy treasury-agent-pro in us-east"
6. Claude orchestrates: quote_tier → verify_payment → deploy_openclaw_instance
7. User receives: MCP endpoint to new agent
8. User connects Claude to new agent's MCP
9. Agent is now ready to execute crypto workflows
```

### Journey 2: Terminal CLI (Priority 2)
```
$ clawdrop login
$ clawdrop list-tiers
$ clawdrop deploy treasury-agent-pro --region us-east --name my-agent
$ clawdrop status deploy_123
$ clawdrop connect deploy_123  # Returns MCP endpoint
```

### Journey 3: Web Dashboard (Priority 3)
```
1. Login to dashboard.clawdrop.io
2. Browse tier gallery
3. Click "Deploy"
4. Select region, configure options
5. Complete payment
6. Watch deployment progress
7. Click "Connect Agent" → get MCP endpoint + SSH docs
```

## Deployment Output

After successful deployment, user receives:

```json
{
  "deployment_id": "deploy_xyz",
  "agent_id": "agent_xyz",
  "status": "running",
  "access_methods": {
    "mcp_endpoint": "clawdrop.live/agents/deploy_xyz/mcp",
    "ssh_host": "vps-xyz.hostinger.com",
    "ssh_user": "agent_user",
    "ssh_port": 22,
    "docker_service": "openclaw-xyz"
  },
  "provisioning_docs": "https://docs.clawdrop.io/access/deploy_xyz",
  "console_url": "https://clawdrop.live/agent/deploy_xyz"
}
```

User can:
- **Connect Claude Code** to `mcp_endpoint` for AI-driven interactions
- **SSH into VPS** for direct management and customization
- **Read provisioning docs** for detailed environment info

## Technology Stack

- **Control Plane**: TypeScript, Node.js, MCP SDK, Zod validation
- **Storage**: In-memory (Phase 1), PostgreSQL (Phase 2+)
- **Payment**: Solana devnet verification via Helius RPC
- **Provisioning**: HFSP API (Docker provisioner)
- **Hosting**: Hostinger VPS (customer's agent runtime)
- **MCP Transport**: stdio (Claude Code), HTTP (future)

## Phase Breakdown

**Phase 0** (Complete): Foundation layer
- Data models (Tier, Payment, Deployment)
- Tool schemas and contracts
- Memory store implementation
- Code compiles successfully

**Phase 1** (Tomorrow, 6 hours): Wire real backends
- Solana devnet verification (Helius RPC)
- HFSP API integration (deployment provisioning)
- Payment status state machine
- Kimi: Tasks A (Solana) + B (HFSP)

**Phase 2** (Friday, 2 hours): Demo-ready
- MCP Gateway fully functional
- Claude Code client integration test
- End-to-end demo: list tiers → deploy → get agent
- Show live deployed agent

**Week 2+**: Scale
- Web dashboard client
- Terminal CLI client
- Provisioning docs generation
- Agent discovery/registry UI
- PostgreSQL persistence
