# Clawdrop MCP Server

**Purpose**: Model Context Protocol (MCP) server exposing Clawdrop agent provisioning functionality to Claude, ChatGPT, and other LLM applications.

## What It Does

Provides MCP tools for:
- ✅ Agent deployment and provisioning
- ✅ Solana wallet operations
- ✅ Agent management and configuration
- ✅ DAO treasury operations
- ✅ Token transfers and approvals

## Quick Start

```bash
cd packages/clawdrop-mcp
npm install
npm run dev
```

Server will be available at `http://localhost:3000`

## Directory Structure

```
clawdrop-mcp/
├── src/
│   ├── index.ts           Entry point
│   ├── commands/          MCP command handlers
│   ├── tools/            Tool definitions
│   └── utils/            Shared utilities
├── tests/                Test suites
├── bin/                  Executable entry point
└── package.json
```

## Using with Claude

To use this MCP server with Claude Code, configure it in your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "clawdrop": {
      "command": "node",
      "args": ["/path/to/clawdrop-mcp/bin/clawdrop-mcp.js"]
    }
  }
}
```

## API Reference

See [../../docs/API.md](../../docs/API.md) for complete tool reference.

## Testing

```bash
npm test
npm run integration-test
```

## Contributing

See [../../CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design and tool structure.

