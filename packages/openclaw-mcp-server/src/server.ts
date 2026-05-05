import 'dotenv/config';
import { SolanaAgentKit, KeypairWallet } from 'solana-agent-kit';
import TokenPlugin from '@solana-agent-kit/plugin-token';
import DefiPlugin from '@solana-agent-kit/plugin-defi';
import NFTPlugin from '@solana-agent-kit/plugin-nft';
import MiscPlugin from '@solana-agent-kit/plugin-misc';
import { startMcpServer } from '@solana-agent-kit/adapter-mcp';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import express from 'express';

const HELIUS_KEY = process.env.HELIUS_API_KEY ?? '';
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const MCP_PORT = parseInt(process.env.MCP_PORT ?? '3002', 10);
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT ?? '3003', 10);

// Initialize wallet — use env key if provided, otherwise generate throwaway
const keypair = process.env.SOLANA_PRIVATE_KEY
  ? Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY))
  : Keypair.generate();

const wallet = new KeypairWallet(keypair);

// Initialize Agent Kit with all available plugins
const agent = new SolanaAgentKit(wallet, RPC_URL, {
  HELIUS_API_KEY: HELIUS_KEY,
  OPENAI_API_KEY: process.env.LLM_API_KEY,
})
  .use(TokenPlugin)
  .use(DefiPlugin)
  .use(NFTPlugin)
  .use(MiscPlugin);

console.log(`[mcp-server] Starting for user ${process.env.USER_ID}`);
console.log(`[mcp-server] Loaded ${agent.actions.length} Agent Kit actions`);

// Start MCP server (exposes all Agent Kit tools via MCP protocol)
startMcpServer(agent.actions, agent, { port: MCP_PORT });
console.log(`[mcp-server] MCP server listening on port ${MCP_PORT}`);

// Health check endpoint (separate port)
const app = express();
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    user_id: process.env.USER_ID,
    actions: agent.actions.length,
    mcp_port: MCP_PORT,
  });
});
app.listen(HEALTH_PORT, () => {
  console.log(`[mcp-server] Health endpoint on port ${HEALTH_PORT}`);
});
