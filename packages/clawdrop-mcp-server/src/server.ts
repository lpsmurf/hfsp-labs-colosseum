import 'dotenv/config';
import { SolanaAgentKit, KeypairWallet } from 'solana-agent-kit';
import TokenPlugin from '@solana-agent-kit/plugin-token';
import DefiPlugin from '@solana-agent-kit/plugin-defi';
import { createMcpServer } from '@solana-agent-kit/adapter-mcp';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import express from 'express';
import { randomUUID } from 'crypto';
import z from 'zod';
import { clawdropTools } from './clawdrop-tools.js';
import { listX402Tools, callX402Tool } from './x402-proxy.js';

const HELIUS_KEY = process.env.HELIUS_API_KEY ?? '';
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const MCP_PORT = parseInt(process.env.MCP_PORT ?? '3002', 10);
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT ?? '3003', 10);

const keypair = process.env.SOLANA_PRIVATE_KEY
  ? Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY))
  : Keypair.generate();

// KeypairWallet(keypair, rpcUrl)
const wallet = new KeypairWallet(keypair, RPC_URL);

const agent = new SolanaAgentKit(wallet, RPC_URL, {
  HELIUS_API_KEY: HELIUS_KEY,
  OPENAI_API_KEY: process.env.LLM_API_KEY,
})
  .use(TokenPlugin)
  .use(DefiPlugin);

// Build actions record for MCP server
const actionsRecord: Record<string, any> = {};
for (const action of agent.actions) {
  actionsRecord[action.name] = action;
}

// Append clawdrop business tools
for (const tool of clawdropTools) {
  actionsRecord[tool.name] = tool;
}

console.log(`[mcp-server] User ${process.env.USER_ID} — ${agent.actions.length} agent actions + ${clawdropTools.length} clawdrop tools = ${Object.keys(actionsRecord).length} total`);

// Create MCP server with HTTP transport
const mcpServer = createMcpServer(actionsRecord, agent as any, {
  name: 'clawdrop-mcp',
  version: '0.1.0',
});

let transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});

// Register x402engine proxy tools, then connect
async function setupServer() {
  try {
    const x402Tools = await listX402Tools();
    for (const tool of x402Tools) {
      mcpServer.registerTool(
        tool.name,
        {
          description: tool.description ?? '',
          inputSchema: z.object({}).passthrough(),
        },
        async (args: any) => {
          return await callX402Tool(tool.name, args);
        }
      );
    }
    console.log(`[mcp-server] ${x402Tools.length} x402engine tools registered`);

    await mcpServer.connect(transport);
    console.log(`[mcp-server] MCP server connected to HTTP transport`);
  } catch (err) {
    console.error(`[mcp-server] MCP setup error:`, (err as Error).message);
  }
}

setupServer();

// Express app for MCP endpoint + health
const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    user_id: process.env.USER_ID,
    actions: Object.keys(actionsRecord).length,
    mcp_port: MCP_PORT,
  });
});

// MCP Streamable HTTP endpoint (GET for SSE, POST for messages)
app.all('/mcp', async (req, res) => {
  // Allow re-initialization for our 1:1 agent-MCP-server container relationship.
  // When the agent restarts or retries, it sends a fresh initialize request.
  // The stateful transport rejects re-init, so we close and recreate it.
  if (req.body?.method === 'initialize') {
    const wst = (transport as any)._webStandardTransport as
      | { _initialized: boolean }
      | undefined;
    if (wst?._initialized) {
      console.log('[mcp-server] Closing stale transport for new agent session');
      await transport.close();
      const newTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });
      await mcpServer.connect(newTransport);
      transport = newTransport;
      console.log('[mcp-server] New transport ready for agent session');
    }
  }

  transport.handleRequest(req, res, req.body).catch((err: Error) => {
    console.error('[mcp-server] transport error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'MCP transport error' });
    }
  });
});

app.listen(MCP_PORT, () => {
  console.log(`[mcp-server] MCP HTTP listening on port ${MCP_PORT}`);
});

// Health endpoint on separate port (if configured differently)
if (HEALTH_PORT !== MCP_PORT) {
  const healthApp = express();
  healthApp.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      user_id: process.env.USER_ID,
      actions: Object.keys(actionsRecord).length,
      mcp_port: MCP_PORT,
    });
  });
  healthApp.listen(HEALTH_PORT, () => {
    console.log(`[mcp-server] Health on port ${HEALTH_PORT}`);
  });
}
