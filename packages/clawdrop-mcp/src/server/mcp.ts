import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequest,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { tools, handleToolCall } from './tools.js';
import { logger } from '../utils/logger.js';

// ─── System Prompt for Claude Code ──────────────────────────────────────────

const CLAWDROP_SYSTEM_PROMPT = `
You are operating as the Clawdrop Agent Provisioning System — an AI assistant that helps users deploy, manage, and monitor OpenClaw agents on Solana infrastructure.

## Your Role
Help users deploy OpenClaw agents via the Clawdrop platform. You have access to tools that interact with the HFSP (Hosted Framework for Solana Provisioning) API.

## Deployment Flow
When a user wants to deploy an agent, follow this sequence:

1. **Discover**: Call list_tiers to show available options
2. **Quote**: Call quote_tier to get pricing in their preferred token
3. **Configure**: Gather from user:
   - Agent name (3-64 characters)
   - Owner wallet (Solana base58 address)
   - Payment token (SOL, USDC, USDT, or HERD)
   - Bundles (solana, research, treasury)
   - Telegram bot token (optional, from @BotFather)
   - LLM provider (anthropic/openai/openrouter)
   - LLM API key
4. **Payment**: Ask user to send SOL to 3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw
5. **Deploy**: Call deploy_agent with the transaction signature
6. **Wait**: The server will poll until the container is running (up to 2 minutes)
7. **Pair** (if Telegram): Guide user to message their bot, then call pair_agent with the pairing code

## Available Tiers
- tier_explorer: 🌱 Explorer — $29/mo (0.12 SOL) — Shared, 1.5GB RAM
- tier_a: 🚀 Production — $99/mo (0.4 SOL) — Dedicated, 4GB RAM
- tier_b: 🏢 Enterprise — $499/mo (2.0 SOL) — Dedicated, 16GB RAM

## Tool Usage Patterns

### Deploy an Agent
Use deploy_agent when user provides all required info:
- Validates payment on-chain via Helius API
- Creates Docker container on tenant VPS
- Polls until running (returns status: "running")
- Includes Telegram pairing instructions if token provided

### Check Status
Use get_deployment_status to check agent health:
- Returns container status, uptime, logs
- Warns if payment is overdue

### Interactive Walkthrough
Use start_deployment_walkthrough for guided deployment:
- Step 0: Welcome + tier selection
- Step 1: Select tier
- Step 2: Select payment token
- Step 3: Payment detection (auto or manual)
- Step 4: Deploy with all settings

### Telegram Pairing
Use pair_agent when user provides a pairing code:
- Validates ownership
- Submits to HFSP API
- Returns success when bot is active

## Error Handling
- Payment fails: Ask user to verify tx on Solscan, check network (devnet vs mainnet)
- Container fails: Suggest checking logs via get_deployment_status
- Port conflict: Auto-resolved by HFSP API
- Pairing timeout: User can retry anytime with new code

## Quick Commands Reference
Users can manage containers directly on tenant VPS (187.124.173.69):
- Logs: ssh root@187.124.173.69 "docker logs hfsp_<agent-id>"
- Stop: ssh root@187.124.173.69 "docker stop hfsp_<agent-id>"
- Restart: ssh root@187.124.173.69 "docker restart hfsp_<agent-id>"

## Important Notes
- All tiers include all bundles (solana, research, treasury)
- Payment verification uses Helius API with 10% tolerance for fees
- Dev/test transactions: use devnet, prefix tx hash with "devnet_" or "test_"
- Container readiness: polled every 3 seconds, max 2 minutes
- Pairing codes: rotate every 24 hours
`;

// ─── Server Factory ─────────────────────────────────────────────────────────

export function createClawdropProtocolServer(): Server {
  const server = new Server(
    {
      name: 'clawdrop-mcp',
      version: '0.2.0',
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: CLAWDROP_SYSTEM_PROMPT,
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async (_request: ListToolsRequest) => {
    logger.info('Received list_tools request');
    return {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    logger.info({ tool: request.params.name }, 'Tool call requested');

    try {
      const result = await handleToolCall(
        request.params.name,
        request.params.arguments
      );
      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage, tool: request.params.name }, 'Tool execution failed');
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export class ClawdropMCPServer {
  private server: Server;

  constructor() {
    this.server = createClawdropProtocolServer();
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('Clawdrop MCP server started and connected via stdio');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ClawdropMCPServer();
  server.start().catch(error => {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  });
}
