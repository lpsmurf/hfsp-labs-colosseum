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
import { clawdropTools } from './clawdrop-tools.js';

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

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});

mcpServer.connect(transport).then(() => {
  console.log(`[mcp-server] MCP server connected to HTTP transport`);
}).catch((err: Error) => {
  console.error(`[mcp-server] MCP connect error:`, err.message);
});

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
app.all('/mcp', (req, res) => {
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
