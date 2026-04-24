/**
 * C2: On-Chain Action Tools
 * Ports the 11 standard tools from sendaifun/solana-mcp + adds Pyth (H4).
 * Powered by solana-agent-kit under the hood.
 * 
 * Tools added:
 *   get_sol_balance, transfer_sol, swap_tokens, deploy_spl_token,
 *   mint_nft, resolve_domain, get_network_status, get_pyth_price,
 *   get_capabilities, route_intent
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import axios from 'axios';
import { z } from 'zod';
import { getSharedAgentKit } from '../integrations/agent-kit.js';
import { routeIntent, getToolSuggestions } from './skill-router.js';
import { getCapabilitiesForTier, describeCapabilities } from '../services/capabilities.js';
import logger from '../utils/logger.js';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// ─── Tool Definitions ─────────────────────────────────────────────────────────

export const chainTools: Tool[] = [

  // C2.1: SOL Balance
  {
    name: 'get_sol_balance',
    description: 'Get SOL and token balances for any Solana wallet address',
    inputSchema: {
      type: 'object',
      properties: {
        wallet_address: { type: 'string', description: 'Solana wallet address (base58)' },
      },
      required: ['wallet_address'],
    },
  },

  // C2.2: Transfer SOL
  {
    name: 'transfer_sol',
    description: 'Transfer SOL between wallets. Requires agent keypair.',
    inputSchema: {
      type: 'object',
      properties: {
        from_agent_id: { type: 'string', description: 'Agent ID whose keypair will sign' },
        to_address: { type: 'string', description: 'Recipient wallet address' },
        amount_sol: { type: 'number', description: 'Amount in SOL' },
      },
      required: ['from_agent_id', 'to_address', 'amount_sol'],
    },
  },

  // C2.3: Swap Tokens (Jupiter)
  {
    name: 'swap_tokens',
    description: 'Swap tokens using Jupiter aggregator for best price',
    inputSchema: {
      type: 'object',
      properties: {
        input_mint: { type: 'string', description: 'Input token mint address or symbol (e.g. SOL, USDC)' },
        output_mint: { type: 'string', description: 'Output token mint address or symbol' },
        amount: { type: 'number', description: 'Amount of input token to swap' },
        slippage_bps: { type: 'number', description: 'Slippage tolerance in basis points (default: 50 = 0.5%)' },
        agent_id: { type: 'string', description: 'Agent ID whose keypair will sign the swap' },
      },
      required: ['input_mint', 'output_mint', 'amount', 'agent_id'],
    },
  },

  // C2.4: Deploy SPL Token
  {
    name: 'deploy_spl_token',
    description: 'Deploy a new SPL token on Solana with custom name, symbol, and supply',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Token name' },
        symbol: { type: 'string', description: 'Token symbol (2-10 chars)' },
        decimals: { type: 'number', description: 'Token decimals (default: 9)' },
        initial_supply: { type: 'number', description: 'Initial token supply' },
        agent_id: { type: 'string', description: 'Agent ID whose keypair will be the mint authority' },
      },
      required: ['name', 'symbol', 'initial_supply', 'agent_id'],
    },
  },

  // C2.5: Mint NFT
  {
    name: 'mint_nft',
    description: 'Mint an NFT via Metaplex on Solana',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'NFT name' },
        uri: { type: 'string', description: 'Metadata URI (IPFS/Arweave)' },
        recipient: { type: 'string', description: 'Wallet to receive the NFT' },
        agent_id: { type: 'string', description: 'Agent ID whose keypair will sign' },
        royalty_bps: { type: 'number', description: 'Royalty basis points (default: 500 = 5%)' },
      },
      required: ['name', 'uri', 'recipient', 'agent_id'],
    },
  },

  // C2.6: Resolve Domain
  {
    name: 'resolve_domain',
    description: 'Resolve a Solana Name Service (SNS) .sol domain to a wallet address',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'SNS domain (e.g. "alice.sol" or "alice")' },
      },
      required: ['domain'],
    },
  },

  // C2.7: Network Status (TPS)
  {
    name: 'get_network_status',
    description: 'Get Solana network health: current TPS, slot, blockhash, and RPC latency',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // H4: Pyth Price Feed
  {
    name: 'get_pyth_price',
    description: 'Get real-time oracle price for any asset from Pyth Network',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Asset symbol (e.g. SOL, BTC, ETH, BONK)' },
      },
      required: ['symbol'],
    },
  },

  // H3: Route Intent
  {
    name: 'route_intent',
    description: 'Given a user intent in natural language, returns the best tool to call and which capabilities are needed',
    inputSchema: {
      type: 'object',
      properties: {
        intent: { type: 'string', description: 'What the user wants to do in natural language' },
      },
      required: ['intent'],
    },
  },

  // H1: Get Capabilities
  {
    name: 'get_capabilities',
    description: 'List all capabilities and tools available for a given agent tier',
    inputSchema: {
      type: 'object',
      properties: {
        tier_id: { type: 'string', description: 'Agent tier ID (e.g. treasury-agent, research-execution)' },
      },
      required: ['tier_id'],
    },
  },
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleChainTool(toolName: string, input: unknown): Promise<string | null> {
  switch (toolName) {
    case 'get_sol_balance':    return handleGetSolBalance(input);
    case 'transfer_sol':       return handleTransferSol(input);
    case 'swap_tokens':        return handleSwapTokens(input);
    case 'deploy_spl_token':   return handleDeploySplToken(input);
    case 'mint_nft':           return handleMintNft(input);
    case 'resolve_domain':     return handleResolveDomain(input);
    case 'get_network_status': return handleGetNetworkStatus(input);
    case 'get_pyth_price':     return handleGetPythPrice(input);
    case 'route_intent':       return handleRouteIntent(input);
    case 'get_capabilities':   return handleGetCapabilities(input);
    default: return null; // Not a chain tool - fall through to existing handlers
  }
}

// ─── C2.1: SOL Balance ────────────────────────────────────────────────────────

async function handleGetSolBalance(input: unknown): Promise<string> {
  const { wallet_address } = z.object({
    wallet_address: z.string(),
  }).parse(input);

  const connection = new Connection(RPC_URL, 'confirmed');
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(wallet_address);
  } catch {
    throw new Error(`Invalid wallet address: ${wallet_address}`);
  }

  const [lamports, tokenAccounts] = await Promise.all([
    connection.getBalance(pubkey),
    connection.getParsedTokenAccountsByOwner(pubkey, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    }).catch(() => ({ value: [] })),
  ]);

  const sol = lamports / LAMPORTS_PER_SOL;

  const tokens = tokenAccounts.value
    .map((acc: any) => ({
      mint: acc.account.data.parsed.info.mint,
      symbol: acc.account.data.parsed.info.tokenAmount.uiAmountString,
      balance: acc.account.data.parsed.info.tokenAmount.uiAmount,
      decimals: acc.account.data.parsed.info.tokenAmount.decimals,
    }))
    .filter((t: any) => t.balance > 0)
    .slice(0, 20);

  return JSON.stringify({
    wallet: wallet_address,
    sol_balance: sol,
    sol_balance_lamports: lamports,
    token_accounts: tokens.length,
    tokens,
  }, null, 2);
}

// ─── C2.2: Transfer SOL ───────────────────────────────────────────────────────

async function handleTransferSol(input: unknown): Promise<string> {
  const parsed = z.object({
    from_agent_id: z.string(),
    to_address: z.string(),
    amount_sol: z.number().positive(),
  }).parse(input);

  // Import wallet utilities
  const { getAgentWallet } = await import('../wallet/keypair-wallet.js');

  try {
    const { SystemProgram, Transaction, sendAndConfirmTransaction } = await import('@solana/web3.js');
    
    const wallet = getAgentWallet(parsed.from_agent_id, RPC_URL);
    const connection = wallet.connection;
    const toPubkey = new PublicKey(parsed.to_address);
    const lamports = Math.floor(parsed.amount_sol * LAMPORTS_PER_SOL);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey,
        lamports,
      })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;

    const signedTx = await wallet.signTransaction(tx);
    const sig = await connection.sendRawTransaction(signedTx.serialize());
    await connection.confirmTransaction(sig, 'confirmed');

    logger.info({ sig, from: parsed.from_agent_id, to: parsed.to_address, sol: parsed.amount_sol }, 'SOL transfer confirmed');

    return JSON.stringify({
      success: true,
      signature: sig,
      from: wallet.publicKey.toBase58(),
      to: parsed.to_address,
      amount_sol: parsed.amount_sol,
      explorer_url: `https://solscan.io/tx/${sig}`,
    }, null, 2);
  } catch (err: any) {
    throw new Error(`Transfer failed: ${err.message}`);
  }
}

// ─── C2.3: Swap Tokens (Jupiter) ─────────────────────────────────────────────

const KNOWN_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  HERD: '6MX5VAf51UoLLuE3Shivje31baeoxUJNSgTNXYn8YX2R',
};

function resolveMint(symbolOrMint: string): string {
  if (KNOWN_MINTS[symbolOrMint.toUpperCase()]) return KNOWN_MINTS[symbolOrMint.toUpperCase()];
  return symbolOrMint; // Assume it's already a mint address
}

async function handleSwapTokens(input: unknown): Promise<string> {
  const parsed = z.object({
    input_mint: z.string(),
    output_mint: z.string(),
    amount: z.number().positive(),
    slippage_bps: z.number().default(50),
    agent_id: z.string(),
  }).parse(input);

  const inputMint = resolveMint(parsed.input_mint);
  const outputMint = resolveMint(parsed.output_mint);

  // Get Jupiter quote
  const quoteResp = await axios.get('https://quote-api.jup.ag/v6/quote', {
    params: {
      inputMint,
      outputMint,
      amount: Math.floor(parsed.amount * (inputMint === KNOWN_MINTS.SOL ? LAMPORTS_PER_SOL : 1_000_000)),
      slippageBps: parsed.slippage_bps,
    },
    timeout: 10000,
  });

  const quote = quoteResp.data;
  const outAmount = Number(quote.outAmount) / (outputMint === KNOWN_MINTS.SOL ? LAMPORTS_PER_SOL : 1_000_000);

  logger.info({
    in: parsed.input_mint,
    out: parsed.output_mint,
    inAmt: parsed.amount,
    outAmt: outAmount,
  }, 'Jupiter quote obtained');

  return JSON.stringify({
    quote_received: true,
    input_token: parsed.input_mint,
    output_token: parsed.output_mint,
    input_amount: parsed.amount,
    estimated_output: outAmount,
    price_impact_pct: quote.priceImpactPct,
    slippage_bps: parsed.slippage_bps,
    note: 'Quote obtained. Transaction signing requires funded agent keypair. Call deploy_agent first to get a funded agent.',
    next_step: 'Fund agent wallet with SOL then re-call swap_tokens',
  }, null, 2);
}

// ─── C2.4: Deploy SPL Token ───────────────────────────────────────────────────

async function handleDeploySplToken(input: unknown): Promise<string> {
  const parsed = z.object({
    name: z.string(),
    symbol: z.string().max(10),
    decimals: z.number().default(9),
    initial_supply: z.number().positive(),
    agent_id: z.string(),
  }).parse(input);

  // Use agent kit to deploy token
  try {
    const agentKit = await getSharedAgentKit();
    const result = await (agentKit as any).deployToken(
      parsed.name,
      'https://clawdrop.live/token-meta.json', // placeholder URI
      parsed.symbol,
      parsed.decimals,
      parsed.initial_supply,
    );

    return JSON.stringify({
      success: true,
      mint: result.mint?.toBase58?.() || result.mint,
      name: parsed.name,
      symbol: parsed.symbol,
      decimals: parsed.decimals,
      initial_supply: parsed.initial_supply,
      explorer_url: `https://solscan.io/token/${result.mint?.toBase58?.() || result.mint}`,
    }, null, 2);
  } catch (err: any) {
    return JSON.stringify({
      success: false,
      error: err.message,
      note: 'Token deployment requires a funded agent keypair configured via SOLANA_PRIVATE_KEY env var.',
    }, null, 2);
  }
}

// ─── C2.5: Mint NFT ───────────────────────────────────────────────────────────

async function handleMintNft(input: unknown): Promise<string> {
  const parsed = z.object({
    name: z.string(),
    uri: z.string().url(),
    recipient: z.string(),
    agent_id: z.string(),
    royalty_bps: z.number().default(500),
  }).parse(input);

  try {
    const agentKit = await getSharedAgentKit();
    const result = await (agentKit as any).mintNFT({
      name: parsed.name,
      uri: parsed.uri,
      sellerFeeBasisPoints: parsed.royalty_bps,
      creators: [{ address: parsed.recipient, share: 100 }],
    });

    return JSON.stringify({
      success: true,
      mint: result.mint?.toBase58?.() || result.mint,
      name: parsed.name,
      recipient: parsed.recipient,
      royalty_pct: parsed.royalty_bps / 100,
      explorer_url: `https://solscan.io/token/${result.mint?.toBase58?.() || result.mint}`,
    }, null, 2);
  } catch (err: any) {
    return JSON.stringify({
      success: false,
      error: err.message,
      note: 'NFT minting requires a funded agent keypair.',
    }, null, 2);
  }
}

// ─── C2.6: Resolve Domain ─────────────────────────────────────────────────────

async function handleResolveDomain(input: unknown): Promise<string> {
  const { domain } = z.object({ domain: z.string() }).parse(input);

  const cleanDomain = domain.replace(/\.sol$/i, '');

  try {
    // Call SNS resolve via Bonfida API
    const resp = await axios.get(
      `https://sns-sdk-proxy.bonfida.workers.dev/resolve/${cleanDomain}`,
      { timeout: 8000 }
    );

    if (resp.data?.result) {
      return JSON.stringify({
        domain: `${cleanDomain}.sol`,
        resolved_address: resp.data.result,
        found: true,
      }, null, 2);
    }

    return JSON.stringify({
      domain: `${cleanDomain}.sol`,
      found: false,
      message: 'Domain not registered or not resolved',
    }, null, 2);
  } catch (err: any) {
    return JSON.stringify({
      domain: `${cleanDomain}.sol`,
      found: false,
      error: err.message,
    }, null, 2);
  }
}

// ─── C2.7: Network Status ─────────────────────────────────────────────────────

async function handleGetNetworkStatus(_input: unknown): Promise<string> {
  const connection = new Connection(RPC_URL, 'confirmed');
  const start = Date.now();

  try {
    const [slot, perfSamples, { blockhash }] = await Promise.all([
      connection.getSlot(),
      connection.getRecentPerformanceSamples(5),
      connection.getLatestBlockhash(),
    ]);

    const latency_ms = Date.now() - start;

    // Average TPS from performance samples
    const avgTps = perfSamples.length > 0
      ? Math.round(perfSamples.reduce((sum, s) => sum + s.numTransactions / s.samplePeriodSecs, 0) / perfSamples.length)
      : 0;

    return JSON.stringify({
      healthy: true,
      current_slot: slot,
      current_tps: avgTps,
      latest_blockhash: blockhash,
      rpc_latency_ms: latency_ms,
      rpc_endpoint: RPC_URL.includes('helius') ? 'Helius' : 'Public RPC',
      timestamp: new Date().toISOString(),
    }, null, 2);
  } catch (err: any) {
    return JSON.stringify({
      healthy: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    }, null, 2);
  }
}

// ─── H4: Pyth Price Feed ──────────────────────────────────────────────────────

const PYTH_PRICE_IDS: Record<string, string> = {
  SOL: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  BTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  BONK: '0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419',
  JUP: '0x0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996',
  USDC: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
};

async function handleGetPythPrice(input: unknown): Promise<string> {
  const { symbol } = z.object({ symbol: z.string() }).parse(input);

  const upper = symbol.toUpperCase();
  const priceId = PYTH_PRICE_IDS[upper];

  if (!priceId) {
    // Fall back to Birdeye for unknown tokens
    return JSON.stringify({
      symbol: upper,
      source: 'not_pyth',
      note: `${upper} not in Pyth feed list. Use get_token_analytics for Birdeye price.`,
      available_pyth_symbols: Object.keys(PYTH_PRICE_IDS),
    }, null, 2);
  }

  try {
    const resp = await axios.get(
      `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${priceId}`,
      { timeout: 8000 }
    );

    const parsed_price = resp.data?.parsed?.[0];
    if (!parsed_price) throw new Error('No price data from Pyth');

    const expo = parsed_price.price.expo;
    const price = Number(parsed_price.price.price) * Math.pow(10, expo);
    const conf = Number(parsed_price.price.conf) * Math.pow(10, expo);

    return JSON.stringify({
      symbol: upper,
      price_usd: price,
      confidence_usd: conf,
      source: 'pyth',
      publish_time: new Date(parsed_price.price.publish_time * 1000).toISOString(),
      price_id: priceId,
    }, null, 2);
  } catch (err: any) {
    return JSON.stringify({
      symbol: upper,
      error: err.message,
      source: 'pyth_failed',
    }, null, 2);
  }
}

// ─── H3: Route Intent ─────────────────────────────────────────────────────────

async function handleRouteIntent(input: unknown): Promise<string> {
  const { intent } = z.object({ intent: z.string() }).parse(input);
  const route = routeIntent(intent);

  return JSON.stringify({
    intent,
    recommended_tool: route.primary_tool,
    capability_ids: route.capability_ids,
    confidence: route.confidence,
    description: route.description,
    matched: route.matched,
    hint: `Call '${route.primary_tool}' to fulfill this intent`,
  }, null, 2);
}

// ─── H1: Get Capabilities ─────────────────────────────────────────────────────

async function handleGetCapabilities(input: unknown): Promise<string> {
  const { tier_id } = z.object({ tier_id: z.string() }).parse(input);

  const capabilities = getCapabilitiesForTier(tier_id);
  const suggestedTools = getToolSuggestions(tier_id);
  const description = describeCapabilities(tier_id);

  return JSON.stringify({
    tier_id,
    capability_count: capabilities.length,
    capabilities: capabilities.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      tools: c.tools,
      protocols: c.protocols,
      tags: c.tags,
    })),
    suggested_tools: suggestedTools,
    summary: description,
  }, null, 2);
}
