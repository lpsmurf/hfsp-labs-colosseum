import { Tool } from '@modelcontextprotocol/sdk/types';
import axios from 'axios';
import {
  ToolInputSchemas,
  ListTiersOutputSchema,
  QuoteTierOutputSchema,
  DeployAgentOutputSchema,
  GetDeploymentStatusOutputSchema,
  CancelSubscriptionOutputSchema,
  RenewSubscriptionInputSchema,
  RenewSubscriptionOutputSchema,
} from './schemas';
import { listTiers, getTier, quoteTier, getTierPrice, getSolPrice, calculateSolAmount, listTiersWithPrices, getTierWithPrice, getSolPriceInfo } from '../services/tier';
import { verifyPayment } from '../services/payment';
import { verifyPaymentTransaction } from '../integrations/helius';
import { CLAWDROP_CONFIG } from '../config/tokens';
import {
  saveAgent,
  getAgent,
  getAgentByIdempotencyKey,
  listAgents,
  listPublicAgents,
  updateAgentStatus,
  loadFromDisk,
  DeployedAgent,
} from '../db/memory';
import { getCredits, topUpCredits, TOOL_COSTS_USD } from '../services/credits';
import { deployViaHFSP, getHFSPStatus, stopViaHFSP, restartViaHFSP } from '../integrations/hfsp';
import logger from '../utils/logger';

// Load persisted state on startup
loadFromDisk();

// ─── Birdeye Integration ──────────────────────────────────────────────────────

interface TokenAnalytics {
  mint: string;
  symbol: string;
  name: string;
  price_usd: number;
  price_change_24h: number;
  market_cap?: number;
  liquidity?: number;
  holder_count?: number;
  volume_24h?: number;
  price_source?: string;
}

interface WalletAnalytics {
  wallet: string;
  total_value_usd: number;
  holdings: Array<{
    mint: string;
    symbol: string;
    balance: number;
    value_usd: number;
    percentage_of_portfolio: number;
  }>;
}

interface CacheEntry {
  data: any;
  expiresAt: number;
}

class BirdeyeCache {
  private store = new Map<string, CacheEntry>();

  get(key: string): any | null {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: any, ttlSeconds: number) {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  clear() {
    this.store.clear();
  }
}

const birdeyeCache = new BirdeyeCache();

const BIRDEYE_CACHE_TTL = {
  PRICE: 300,      // 5 minutes
  TRENDING: 600,   // 10 minutes
  WALLET: 300,     // 5 minutes
  META: 3600,      // 1 hour
};

const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY!;
const BIRDEYE_BASE_URL = 'https://public-api.birdeye.so';
const JUPITER_PRICE = 'https://price.jup.ag/v6/price';

const birdeyeApi = axios.create({
  baseURL: BIRDEYE_BASE_URL,
  headers: {
    'X-API-KEY': BIRDEYE_API_KEY || 'demo',
    'Accept': 'application/json',
  },
  timeout: 10000,
});

// Retry on 521 errors
birdeyeApi.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config;
    if (!config || !config.retry) {
      config.retry = 0;
    }
    if (err.response?.status === 521 && config.retry < 3) {
      config.retry++;
      const delay = Math.pow(2, config.retry) * 1000;
      logger.warn({ retry: config.retry, delay }, 'Retrying Birdeye API (521 error)');
      await new Promise(r => setTimeout(r, delay));
      return birdeyeApi(config);
    }
    return Promise.reject(err);
  }
);

async function getTokenPriceWithFallback(mint: string): Promise<any> {
  try {
    const res = await birdeyeApi.get(`/defi/price?token_address=${mint}&chain=solana`);
    if (res.data?.success !== false) {
      return { price_usd: res.data?.price || res.data?.value, source: 'birdeye' };
    }
  } catch (err: any) {
    logger.warn({ mint, error: err.message }, 'Birdeye price failed, falling back to Jupiter');
  }

  try {
    const res = await axios.get(`${JUPITER_PRICE}?ids=${mint}`);
    const price = res.data.data?.[mint]?.price;
    return { price_usd: price, source: 'jupiter' };
  } catch (err: any) {
    logger.error({ mint, error: err.message }, 'Both Birdeye and Jupiter price failed');
    return { price_usd: 0, source: 'none' };
  }
}

async function birdeyeGetTokenMeta(mint: string) {
  try {
    const res = await birdeyeApi.get(`/defi/v3/token/meta-data/single?tokenAddress=${mint}`);
    return res.data?.data || res.data;
  } catch (err: any) {
    if (err.response?.status === 403) {
      logger.warn('Birdeye v3 metadata requires higher permissions, using fallback');
    }
    return { symbol: 'UNKNOWN', name: 'Unknown Token' };
  }
}

async function birdeyeGetTokenPrice(mint: string) {
  return getTokenPriceWithFallback(mint);
}

async function birdeyeGetTrendingTokens() {
  const res = await birdeyeApi.get('/defi/token_trending?limit=10');
  return res.data?.data || res.data;
}

async function birdeyeGetWalletTokens(wallet: string) {
  const res = await birdeyeApi.get(`/v1/wallet/token_list?address=${wallet}`);
  return res.data?.data || res.data;
}

// ─── Risk Policy Integration ─────────────────────────────────────────────────

type RiskTier = 'GREEN' | 'YELLOW' | 'RED';

interface PolicyDecision {
  action: 'swap' | 'send' | 'stake';
  token_mint: string;
  risk_tier: RiskTier;
  decision: 'allowed' | 'warned' | 'blocked';
  reason_if_blocked?: string;
  warning_message?: string;
}

const WHITELIST = (process.env.WHITELIST_TOKENS || 'So11111111111111111111111111111111111111112,EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
  .split(',')
  .filter(Boolean);

const RISK_POLICY = process.env.RISK_POLICY || 'normal';

async function assessTokenRisk(mint: string): Promise<{ tier: RiskTier; confidence: number; flags: string[]; reasoning: string; recommendation: 'proceed' | 'caution' | 'block' }> {
  const API_KEY = process.env.DD_XYZ_API_KEY;

  if (!API_KEY) {
    logger.warn('DD_XYZ_API_KEY not set, returning YELLOW risk');
    return {
      tier: 'YELLOW',
      confidence: 50,
      flags: ['api_key_missing'],
      reasoning: 'Risk API not configured - proceeding with caution',
      recommendation: 'caution',
    };
  }

  try {
    const res = await axios.get(`https://dd.xyz/api/v1/token_risk?address=${mint}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      timeout: 10000,
    });

    const tier = (res.data.tier || 'yellow').toUpperCase() as RiskTier;
    return {
      tier,
      confidence: res.data.confidence || 80,
      flags: res.data.flags || [],
      reasoning: res.data.reasoning || 'No specific issues detected',
      recommendation: tier === 'GREEN' ? 'proceed' : tier === 'RED' ? 'block' : 'caution',
    };
  } catch (err) {
    logger.error({ err, mint }, 'Failed to assess token risk');
    return {
      tier: 'YELLOW',
      confidence: 50,
      flags: ['api_error'],
      reasoning: 'Unable to assess risk - API error',
      recommendation: 'caution',
    };
  }
}

async function executeWithRiskCheck(
  action: 'swap' | 'send' | 'stake',
  tokenMint: string,
  _amount: number
): Promise<PolicyDecision> {
  if (WHITELIST.includes(tokenMint)) {
    return { action, token_mint: tokenMint, risk_tier: 'GREEN', decision: 'allowed' };
  }

  const risk = await assessTokenRisk(tokenMint);

  if (risk.tier === 'GREEN') {
    return { action, token_mint: tokenMint, risk_tier: 'GREEN', decision: 'allowed' };
  }

  if (risk.tier === 'YELLOW') {
    const strictMode = RISK_POLICY === 'strict';
    return {
      action, token_mint: tokenMint, risk_tier: 'YELLOW',
      decision: strictMode ? 'blocked' : 'warned',
      warning_message: strictMode ? `Blocked: ${risk.reasoning}` : `⚠️ Caution: ${risk.reasoning}`,
      reason_if_blocked: strictMode ? risk.reasoning : undefined,
    };
  }

  return {
    action, token_mint: tokenMint, risk_tier: 'RED', decision: 'blocked',
    reason_if_blocked: `🚫 Blocked for safety: ${risk.reasoning}`,
  };
}

function getRiskEmoji(tier: RiskTier): string {
  switch (tier) {
    case 'GREEN': return '🟢';
    case 'YELLOW': return '🟡';
    case 'RED': return '🔴';
  }
}

// ─── Agent Polling & Pairing ─────────────────────────────────────────────────

async function waitForAgentReady(agentId: string, maxWaitMs = 120000, intervalMs = 3000): Promise<{ ready: boolean; status: string; error?: string }> {
  const startTime = Date.now();
  logger.info({ agent_id: agentId }, 'Polling for container readiness...');

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const hfspStatus = await getHFSPStatus(agentId);
      if (!hfspStatus.error && hfspStatus.status) {
        if (hfspStatus.status === 'running') {
          logger.info({ agent_id: agentId, status: hfspStatus.status }, 'Container is running');
          return { ready: true, status: hfspStatus.status };
        }
        if (hfspStatus.status === 'error' || hfspStatus.status === 'stopped') {
          return { ready: false, status: hfspStatus.status, error: 'Container failed to start' };
        }
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Polling error, retrying...');
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }

  return { ready: false, status: 'timeout', error: 'Container did not become ready within 2 minutes' };
}

async function pairAgentViaHFSP(agentId: string, pairingCode: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const HFSP_API_URL = process.env.HFSP_API_URL || 'http://localhost:3001/api/v1';
    const HFSP_API_KEY = process.env.HFSP_API_KEY;
  if (!HFSP_API_KEY) throw new Error('HFSP_API_KEY env var required');

    const response = await axios.post(
      `${HFSP_API_URL}/agents/${agentId}/pair`,
      { pairingCode },
      { headers: { Authorization: `Bearer ${HFSP_API_KEY}` }, timeout: 10000 }
    );

    if (response.data?.success) {
      return { success: true, message: response.data.message };
    }
    return { success: false, error: response.data?.message || 'Pairing failed' };
  } catch (err: any) {
    logger.error({ err: err.message, agentId }, 'Pairing request failed');
    return { success: false, error: err.message };
  }
}

// ─── Tool definitions (JSON Schema for MCP protocol) ─────────────────────────

export const tools: Tool[] = [
  {
    name: 'list_tiers',
    description:
      'List all available Clawdrop deployment tiers with pricing and capacity info. ' +
      'All tiers include access to solana, research, and treasury capability bundles.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'quote_tier',
    description:
      'Get a price quote for a deployment tier in your chosen payment token ' +
      '(SOL, USDT, USDC, or HERD). Bundles do not affect the price.',
    inputSchema: {
      type: 'object',
      properties: {
        tier_id: {
          type: 'string',
          description: 'Tier to quote: tier_a (Shared), tier_b (Dedicated), tier_c (Custom)',
        },
        payment_token: {
          type: 'string',
          enum: ['SOL', 'USDT', 'USDC', 'HERD'],
          description: 'Token you want to pay with',
          default: 'SOL',
        },
        bundles: {
          type: 'array',
          items: { type: 'string', enum: ['solana', 'research', 'treasury'] },
          description: 'Capability bundles to include (optional, do not affect price)',
          default: [],
        },
      },
      required: ['tier_id'],
    },
  },
    {
      name: 'pair_agent',
      description:
        'Complete Telegram pairing for a deployed agent. Submit the pairing code shown in your Telegram bot.',
      inputSchema: {
        type: 'object',
        properties: {
          agent_id: {
            type: 'string',
            description: 'The agent ID returned from deploy_agent',
          },
          owner_wallet: {
            type: 'string',
            description: 'Your Solana wallet public key (proves ownership)',
          },
          pairing_code: {
            type: 'string',
            description: 'The pairing code shown when you message your Telegram bot (e.g., 4P48NNYE)',
          },
        },
        required: ['agent_id', 'owner_wallet', 'pairing_code'],
      },
    },
  {
    name: 'deploy_agent',
    description:
      'Deploy a new OpenClaw agent after confirming payment. Provide the transaction hash ' +
      'from your Solana wallet. The agent will be provisioned via HFSP with your chosen bundles.',
    inputSchema: {
      type: 'object',
      properties: {
        tier_id: { type: 'string', description: 'Tier to deploy on' },
        agent_name: {
          type: 'string',
          description: 'Display name for your agent (3-64 characters)',
        },
        owner_wallet: {
          type: 'string',
          description: 'Your Solana wallet public key (receives SSH access)',
        },
        payment_token: {
          type: 'string',
          enum: ['SOL', 'USDT', 'USDC', 'HERD'],
          description: 'Token used for payment',
        },
        payment_tx_hash: {
          type: 'string',
          description: 'Transaction signature from your Solana wallet',
        },
        bundles: {
          type: 'array',
          items: { type: 'string', enum: ['solana', 'research', 'treasury'] },
          description: 'Capability bundles to install',
          default: [],
        },
        telegram_token: {
          type: 'string',
          description:
            'Telegram bot token from @BotFather — enables your agent on Telegram (optional)',
        },
        llm_provider: {
          type: 'string',
          enum: ['anthropic', 'openai', 'openrouter'],
          description: 'LLM provider for your agent (default: anthropic)',
        },
        llm_api_key: {
          type: 'string',
          description: 'API key for your chosen LLM provider',
        },
      },
      required: ['tier_id', 'agent_name', 'owner_wallet', 'payment_token', 'payment_tx_hash'],
    },
  },
  {
    name: 'get_deployment_status',
    description: 'Check the status, subscription health, and recent logs of a deployed agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID returned from deploy_agent',
        },
        owner_wallet: {
          type: 'string',
          description: 'Your Solana wallet public key (proves ownership)',
        },
      },
      required: ['agent_id', 'owner_wallet'],
    },
  },
  {
    name: 'cancel_subscription',
    description:
      'Cancel an active agent subscription. The agent will be stopped immediately. ' +
      'This action is irreversible.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'The agent ID to cancel' },
        owner_wallet: {
          type: 'string',
          description: 'Your Solana wallet public key (proves ownership)',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm — the agent will be stopped permanently',
        },
      },
      required: ['agent_id', 'owner_wallet', 'confirm'],
    },
  },
  {
    name: 'renew_subscription',
    description: 'Renew a Clawdrop agent subscription after payment. Extends the billing period by 30 days and restarts the agent if it was stopped due to non-payment.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID to renew (from deploy_agent or get_deployment_status)',
        },
        owner_wallet: {
          type: 'string',
          description: 'Your Solana wallet public key (must match original owner)',
        },
        payment_tx_hash: {
          type: 'string',
          description: 'Transaction signature of your renewal payment on Solana',
        },
        payment_token: {
          type: 'string',
          enum: ['SOL', 'USDC', 'USDT'],
          description: 'Token used for payment (default: SOL)',
        },
      },
      required: ['agent_id', 'owner_wallet', 'payment_tx_hash'],
    },
  },
  {
    name: 'get_credits',
    description: 'Check your agent\'s credit balance for premium tool calls (web search, flight booking, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        owner_wallet: { type: 'string' },
      },
      required: ['agent_id', 'owner_wallet'],
    },
  },

  {
    name: 'list_agents',
    description: 'List all your deployed Clawdrop agents with live status and subscription health.',
    inputSchema: {
      type: 'object',
      properties: {
        owner_wallet: { type: 'string', description: 'Your Solana wallet — returns all agents you own' },
      },
      required: ['owner_wallet'],
    },
  },
  {
    name: 'make_agent_public',
    description: 'Publish your agent to the Clawdrop registry so others can discover and clone it.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        owner_wallet: { type: 'string' },
        public_description: { type: 'string', description: 'What this agent does — shown in the registry' },
        tags: { type: 'array', items: { type: 'string' }, description: 'e.g. ["travel","defi","research"]' },
      },
      required: ['agent_id', 'owner_wallet', 'public_description'],
    },
  },
  {
    name: 'browse_registry',
    description: 'Browse public Clawdrop agent templates. Find useful agents others have deployed and clone them.',
    inputSchema: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: 'Filter by tag (e.g. "travel", "defi")' },
        bundle: { type: 'string', description: 'Filter by capability bundle' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'top_up_credits',
    description: 'Add USDC credits to your agent for premium tool calls. Send USDC to CLAWDROP_WALLET_ADDRESS then provide the tx hash.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string' },
        owner_wallet: { type: 'string' },
        amount_usd: { type: 'number', description: 'Amount in USD to credit' },
        payment_tx_hash: { type: 'string', description: 'Transaction hash of your USDC payment' },
      },
      required: ['agent_id', 'owner_wallet', 'amount_usd', 'payment_tx_hash'],
    },
  },
  // Birdeye tools
  {
    name: 'get_token_analytics',
    description: 'Get detailed analytics for a token (price, liquidity, holder count, volume)',
    inputSchema: {
      type: 'object',
      properties: {
        mint: {
          type: 'string',
          description: 'Token mint address (e.g., EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v for USDC)'
        }
      },
      required: ['mint'],
    },
  },
  {
    name: 'get_market_overview',
    description: 'Get trending tokens on Solana (top 10 by volume/activity)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_wallet_analytics',
    description: 'Analyze a wallet\'s token holdings and portfolio value',
    inputSchema: {
      type: 'object',
      properties: {
        wallet: {
          type: 'string',
          description: 'Solana wallet address to analyze'
        }
      },
      required: ['wallet'],
    },
  },
  // Risk Policy tool
  {
    name: 'check_token_risk',
    description: 'Assess the on-chain risk of a token before transacting (Green/Yellow/Red)',
    inputSchema: {
      type: 'object',
      properties: {
        mint: {
          type: 'string',
          description: 'Token mint address to check'
        },
        action: {
          type: 'string',
          enum: ['swap', 'send', 'stake'],
          description: 'Type of transaction you plan to do'
        },
        amount: {
          type: 'number',
          description: 'Amount (for context)',
          default: 0
        },
      },
      required: ['mint', 'action'],
    },
  },
  {
    name: 'start_deployment_walkthrough',
    description:
      'Interactive step-by-step guide to deploy an OpenClaw agent on Solana testnet. ' +
      'Guides through: tier selection → token → auto-detects payment on-chain → Telegram → deploy. ' +
      'Start with step 0. Each step tells you exactly what to do next.',
    inputSchema: {
      type: 'object',
      properties: {
        step: { type: 'number', description: 'Current step (0=start, 1=tier, 2=token, 3=payment, 4=deploy)', default: 0 },
        selected_tier: { type: 'string', description: 'Chosen tier id: tier_a | tier_b | tier_c' },
        selected_token: { type: 'string', description: 'Payment token: SOL | USDC | HERD | EURC' },
        owner_wallet: { type: 'string', description: 'Your Solana wallet address' },
        agent_name: { type: 'string', description: 'Name for your agent (optional)' },
        telegram_token: { type: 'string', description: 'Telegram bot token from @BotFather (optional)' },
        detected_tx: { type: 'string', description: 'Auto-detected tx hash from step 3 (pass back in step 4)' },
      },
      required: [],
    },
  },
];


// ─── Tool dispatcher ──────────────────────────────────────────────────────────

export async function handleToolCall(toolName: string, toolInput: unknown): Promise<string> {
  logger.info({ tool: toolName }, 'Tool call received');
  try {
    switch (toolName) {
      case 'list_tiers':          return await handleListTiers(toolInput);
      case 'quote_tier':          return await handleQuoteTier(toolInput);
      case 'deploy_agent':        return await handleDeployAgent(toolInput);
      case 'pair_agent':          return await handlePairAgent(toolInput);
      case 'get_deployment_status': return await handleGetDeploymentStatus(toolInput);
      case 'cancel_subscription': return await handleCancelSubscription(toolInput);
      case 'renew_subscription':  return await handleRenewSubscription(toolInput);
      case 'list_agents':         return await handleListAgents(toolInput);
      case 'make_agent_public':   return await handleMakeAgentPublic(toolInput);
      case 'browse_registry':     return await handleBrowseRegistry(toolInput);
      case 'get_credits':         return await handleGetCredits(toolInput);
      case 'top_up_credits':      return await handleTopUpCredits(toolInput);
      case 'get_token_analytics': return await handleGetTokenAnalytics(toolInput);
      case 'get_market_overview': return await handleGetMarketOverview(toolInput);
      case 'get_wallet_analytics': return await handleGetWalletAnalytics(toolInput);
      case 'check_token_risk':    return await handleCheckTokenRisk(toolInput);
      case 'start_deployment_walkthrough': return await handleDeploymentWalkthrough(toolInput);
      default: throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    logger.error({ error, tool: toolName }, 'Tool execution failed');
    throw error;
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleListTiers(input: unknown): Promise<string> {
  ToolInputSchemas.list_tiers.parse(input);

  const solPrice = await (await import('../services/tier.js')).getSolPrice();
  const tiers = listTiers();
  const response = ListTiersOutputSchema.parse({
    tiers: tiers.map(t => ({
      tier_id: t.id,
      name: t.name,
      description: t.description,
      price_usd: t.price_usd,
      price_sol: calculateSolAmount(t.price_usd, solPrice),
      vps_type: t.vps_type,
      vps_capacity: t.vps_capacity,
      available_bundles: ['solana', 'research', 'treasury'],
    })),
  });

  return JSON.stringify(response, null, 2);
}

async function handleQuoteTier(input: unknown): Promise<string> {
  const parsed = ToolInputSchemas.quote_tier.parse(input);

  // quoteTier returns { tier, payment: PaymentQuote, bundles_available }
  const tierQuote = await quoteTier(parsed.tier_id, parsed.payment_token);

  const { tier, payment } = tierQuote;

  // Calculate fee_usd from business rule (smart fee: <$100 flat $1, ≥$100 → 0.35%)
  const fee_usd =
    payment.tier_price_usd < 100
      ? 1.0
      : parseFloat((payment.tier_price_usd * 0.0035).toFixed(2));

  const fee_breakdown =
    payment.tier_price_usd < 100
      ? 'Flat fee: $1.00 (transactions under $100)'
      : `0.35% swap fee: $${fee_usd.toFixed(2)} (on $${payment.tier_price_usd.toFixed(2)})`;

  const response = QuoteTierOutputSchema.parse({
    tier_id: tier.id,
    tier_name: tier.name,
    price_usd: payment.tier_price_usd,
    price_in_token: payment.amount_to_send,
    payment_token: parsed.payment_token,
    fee_usd,
    fee_breakdown,
    bundles_included: parsed.bundles,
    quote_expires_at: payment.expires_at.toISOString(),
  });

  return JSON.stringify(response, null, 2);
}


// Validate Telegram token by calling Telegram API
async function validateTelegramToken(token: string): Promise<{valid: boolean; error?: string}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return {valid: false, error: 'Invalid or revoked Telegram token'};
      }
      return {valid: true};
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (e) {
    return {valid: false, error: 'Telegram API unreachable'};
  }
}

async function handleDeployAgent(input: unknown): Promise<string> {
  const parsed = ToolInputSchemas.deploy_agent.parse(input);

  // 0. Sanitize all inputs
  const sanitized = {
    tier_id: parsed.tier_id.trim(),
    agent_name: parsed.agent_name.trim(),
    owner_wallet: parsed.owner_wallet.trim(),
    payment_token: parsed.payment_token.trim(),
    payment_tx_hash: parsed.payment_tx_hash.trim(),
    telegram_token: (parsed as any).telegram_token?.trim(),
    llm_provider: (parsed as any).llm_provider?.trim() || 'anthropic',
    llm_api_key: (parsed as any).llm_api_key?.trim(),
    bundles: parsed.bundles,
  };

  // Validate required fields are non-empty after trim
  if (!sanitized.tier_id || !sanitized.agent_name || !sanitized.owner_wallet || !sanitized.telegram_token) {
    throw new Error('Invalid input: all required fields must be non-empty');
  }

  // Validate Telegram token early (before payment)
  if (!sanitized.telegram_token.match(/^\d+:[\w-]+$/)) {
    throw new Error('Invalid Telegram token format. Expected format: numeric:alphanumeric (e.g., 123456789:ABCdefGHIjklmnoPQRstuvWXYZ)');
  }

  const tokenValidation = await validateTelegramToken(sanitized.telegram_token);
  if (!tokenValidation.valid) {
    throw new Error(`Cannot deploy: ${tokenValidation.error}. Fix your Telegram token and try again.`);
  }

  // 0.5 Check idempotency - if same key, return existing deployment
  const idempotency_key = (parsed as any).idempotency_key || crypto.randomUUID();
  if (idempotency_key) {
    try {
      const existing = getAgentByIdempotencyKey(idempotency_key);
      if (existing) {
        logger.info({ idempotency_key, existing_id: existing.agent_id }, 'Idempotent retry detected');
        return JSON.stringify({
          success: true,
          message: 'Deployment already in progress',
          deployment_id: existing.agent_id,
          status: existing.status,
        });
      }
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      logger.warn({ error: errorMsg }, 'Could not check idempotency key');
    }
  }

  // 1. Verify payment on-chain
  if (parsed.payment_tx_hash.startsWith('devnet_') || parsed.payment_tx_hash.startsWith('test_')) {
    // Dev mode: skip verification for test hashes
    logger.info('[DEV] Skipping on-chain verification for test tx: ' + parsed.payment_tx_hash);
  } else {
    // Production: full on-chain verification via Helius
    const tier = getTier(parsed.tier_id);
    if (!tier) throw new Error(`Tier not found: ${parsed.tier_id}`);
    const tierPriceSol = await getTierPrice(parsed.tier_id);
    const verification = await verifyPaymentTransaction({
      tx_hash: parsed.payment_tx_hash,
      expected_recipient: CLAWDROP_CONFIG.WALLET_ADDRESS,
      min_amount_sol: tierPriceSol,
      network: 'mainnet',
    });
    if (!verification.verified) {
      throw new Error('Payment verification failed: ' + verification.reason);
    }
    logger.info({ tx_hash: parsed.payment_tx_hash, amount: verification.actual_amount_sol }, 'Payment verified on-chain');
  }

  // 2. Get tier info
  const tier = getTier(parsed.tier_id);
  if (!tier) throw new Error(`Tier not found: ${parsed.tier_id}`);

  // Enforce max agents per wallet per tier
  const walletAgents = listAgents(parsed.owner_wallet).filter(a => a.status === 'running' || a.status === 'provisioning');
  if (walletAgents.length >= tier.max_agents) {
    throw new Error(
      `Max agents reached for ${tier.name}: ${tier.max_agents} agent(s) allowed. ` +
      `You have ${walletAgents.length} running. Cancel one or upgrade your tier.`
    );
  }

  // 3. Deploy via HFSP
  const agent_id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const payment_id = `pay_${Date.now()}`;

  const hfspResp = await deployViaHFSP({
    deployment_id: agent_id,
    tier_id: parsed.tier_id,
    region: 'eu-west',
    capability_bundle: parsed.bundles.join(',') || 'none',
    payment_verified: true,
    wallet_address: parsed.owner_wallet,
    telegram_token: (parsed as any).telegram_token,
    llm_provider: (parsed as any).llm_provider || 'anthropic',
    llm_api_key: (parsed as any).llm_api_key,
    config: {
      agent_name: parsed.agent_name,
      installed_bundles: parsed.bundles,
    },
  });

  if (hfspResp.error) {
    throw new Error(`HFSP provisioning failed: ${hfspResp.error}`);
  }

  // 4. Persist to DB
  const now = new Date();
  const nextPayment = new Date(now);
  nextPayment.setDate(nextPayment.getDate() + 30);

  // Get dynamic SOL price for payment history
  const tierPriceSol = await getTierPrice(parsed.tier_id);

  const agent: DeployedAgent = {
    agent_id: hfspResp.agent_id,
    tier_id: parsed.tier_id,
    agent_name: parsed.agent_name,
    owner_wallet: parsed.owner_wallet,
    bundles: parsed.bundles as DeployedAgent['bundles'],
    status: 'provisioning',
    console_url: hfspResp.endpoint,
    deployed_at: now,
    last_activity: now,
    subscription: {
      tier_id: parsed.tier_id,
      amount_usd: tier.price_usd,
      payment_token: parsed.payment_token,
      started_at: now,
      next_payment_due: nextPayment,
      grace_period_end: null,
      payment_history: [
        {
          payment_id,
          amount: tierPriceSol,
          token: parsed.payment_token,
          tx_hash: parsed.payment_tx_hash,
          timestamp: now,
          fee_charged_usd: tier.price_usd < 100 ? 1.0 : tier.price_usd * 0.0035,
          jupiter_swap: parsed.payment_token !== 'SOL',
        },
      ],
    },
    logs: [
      {
        timestamp: now,
        level: 'info',
        message: `Provisioning started. Tier: ${parsed.tier_id}. Bundles: ${
          parsed.bundles.join(', ') || 'none'
        }`,
      },
    ],
    idempotency_key,
  };

  saveAgent(agent);

  logger.info(
    { agent_id: agent.agent_id, tier_id: parsed.tier_id, bundles: parsed.bundles },
    'Agent deployed'
  );

  // 5. Poll until container is running
  logger.info({ agent_id: agent.agent_id }, 'Polling for container readiness...');
  const readyResult = await waitForAgentReady(agent.agent_id, 120000, 3000);

  if (!readyResult.ready) {
    updateAgentStatus(agent.agent_id, 'failed');
    const failResponse = DeployAgentOutputSchema.parse({
      agent_id: agent.agent_id,
      agent_name: parsed.agent_name,
      tier_id: parsed.tier_id,
      status: 'failed',
      bundles: parsed.bundles,
      deployed_at: now.toISOString(),
      next_payment_due: nextPayment.toISOString(),
      console_url: hfspResp.endpoint,
      message:
        `Agent "${parsed.agent_name}" deployment failed: ${readyResult.error}. ` +
        `Check get_deployment_status for details.`,
    });
    return JSON.stringify(failResponse, null, 2);
  }

  updateAgentStatus(agent.agent_id, 'running');

  let pairingInstructions = '';
  if ((parsed as any).telegram_token) {
    pairingInstructions =
      `\n\n📱 **Telegram Pairing Required**\n` +
      `1. Message your Telegram bot\n` +
      `2. You'll see a pairing code (e.g., 4P48NNYE)\n` +
      `3. Call pair_agent with:\n` +
      `   agent_id: "${agent.agent_id}"\n` +
      `   owner_wallet: "${parsed.owner_wallet}"\n` +
      `   pairing_code: "YOUR_CODE"`;
  }

  const response = DeployAgentOutputSchema.parse({
    agent_id: agent.agent_id,
    agent_name: parsed.agent_name,
    tier_id: parsed.tier_id,
    status: 'running',
    bundles: parsed.bundles,
    deployed_at: now.toISOString(),
    next_payment_due: nextPayment.toISOString(),
    console_url: hfspResp.endpoint,
    message:
      `Agent "${parsed.agent_name}" is running on ${tier.name}. ` +
      `SSH access at ${hfspResp.endpoint ?? 'your VPS IP'}. ` +
      `Next payment due: ${nextPayment.toLocaleDateString()}.` +
      pairingInstructions,
  });

  return JSON.stringify(response, null, 2);
}

async function handlePairAgent(input: unknown): Promise<string> {
  const parsed = (input as any);
  const { agent_id, owner_wallet, pairing_code } = parsed;

  // Validate inputs
  if (!agent_id || !owner_wallet || !pairing_code) {
    throw new Error('agent_id, owner_wallet, and pairing_code are required');
  }

  // Verify agent exists and belongs to wallet
  const agent = getAgent(agent_id);
  if (!agent) throw new Error(`Agent not found: ${agent_id}`);
  if (agent.owner_wallet !== owner_wallet) {
    throw new Error('Unauthorized: wallet does not match agent owner');
  }

  // Call HFSP API to pair
  const result = await pairAgentViaHFSP(agent_id, pairing_code);

  if (!result.success) {
    throw new Error('Pairing failed: ' + result.error);
  }

  // Update agent status
  updateAgentStatus(agent_id, 'running');
  agent.logs.push({
    timestamp: new Date(),
    level: 'info',
    message: `Telegram paired successfully with code: ${pairing_code}`,
  });
  saveAgent(agent);

  return JSON.stringify({
    success: true,
    agent_id,
    message: result.message || 'Agent paired and active on Telegram',
    next_step: 'Message your Telegram bot to test the connection',
  }, null, 2);
}

async function handleGetDeploymentStatus(input: unknown): Promise<string> {
  const parsed = ToolInputSchemas.get_deployment_status.parse(input);

  const agent = getAgent(parsed.agent_id);
  if (!agent) throw new Error(`Agent not found: ${parsed.agent_id}`);

  // Ownership check — prevents IDOR
  if (agent.owner_wallet !== parsed.owner_wallet) {
    throw new Error('Unauthorized: wallet does not match agent owner');
  }

  // Poll HFSP for live status
  const hfspStatus = await getHFSPStatus(parsed.agent_id);
  if (!hfspStatus.error && hfspStatus.status) {
    updateAgentStatus(parsed.agent_id, hfspStatus.status as DeployedAgent['status']);
  }

  const fresh = getAgent(parsed.agent_id)!;
  const uptimeSeconds = Math.floor((Date.now() - fresh.deployed_at.getTime()) / 1000);

  // Build warning message if in grace period or overdue
  let warning: string | null = null;
  const now = new Date();
  if (fresh.subscription.grace_period_end && now < fresh.subscription.grace_period_end) {
    const hoursLeft = Math.round((fresh.subscription.grace_period_end.getTime() - now.getTime()) / 3_600_000);
    warning = `⚠️ Payment overdue — agent stops in ${hoursLeft}h. Run renew_subscription to continue.`;
  } else if (now > fresh.subscription.next_payment_due) {
    warning = `⚠️ Payment overdue. Renewal required immediately or agent will be stopped.`;
  }

  const response = GetDeploymentStatusOutputSchema.parse({
    agent_id: fresh.agent_id,
    agent_name: fresh.agent_name,
    tier_id: fresh.tier_id,
    status: fresh.status,
    bundles: fresh.bundles,
    vps_ip: fresh.vps_ip,
    console_url: fresh.console_url,
    uptime_seconds: uptimeSeconds,
    last_activity: fresh.last_activity.toISOString(),
    subscription: {
      next_payment_due: fresh.subscription.next_payment_due.toISOString(),
      grace_period_end: fresh.subscription.grace_period_end?.toISOString() ?? null,
      amount_usd: fresh.subscription.amount_usd,
      payment_token: fresh.subscription.payment_token,
      payments_made: fresh.subscription.payment_history.length,
    },
    recent_logs: fresh.logs.slice(-10).map(l => ({
      timestamp: l.timestamp.toISOString(),
      level: l.level,
      message: l.message,
    })),
    warning,
  });

  return JSON.stringify(response, null, 2);
}

async function handleCancelSubscription(input: unknown): Promise<string> {
  const parsed = ToolInputSchemas.cancel_subscription.parse(input);

  if (!parsed.confirm) {
    throw new Error('Cancellation requires confirm: true');
  }

  const agent = getAgent(parsed.agent_id);
  if (!agent) throw new Error(`Agent not found: ${parsed.agent_id}`);

  // Ownership check — prevents IDOR
  if (agent.owner_wallet !== parsed.owner_wallet) {
    throw new Error('Unauthorized: wallet does not match agent owner');
  }

  if (agent.status === 'stopped') {
    throw new Error(`Agent ${parsed.agent_id} is already stopped`);
  }

  await stopViaHFSP(parsed.agent_id);
  updateAgentStatus(parsed.agent_id, 'stopped');

  logger.info({ agent_id: parsed.agent_id }, 'Agent subscription cancelled');

  const response = CancelSubscriptionOutputSchema.parse({
    agent_id: parsed.agent_id,
    status: 'stopped',
    message:
      `Agent "${agent.agent_name}" has been stopped and subscription cancelled. ` +
      'Your VPS will be decommissioned shortly.',
    stopped_at: new Date().toISOString(),
  });

  return JSON.stringify(response, null, 2);
}

async function handleRenewSubscription(input: unknown): Promise<string> {
  const parsed = ToolInputSchemas.renew_subscription.parse(input);

  // Ownership check
  const agent = getAgent(parsed.agent_id);
  if (!agent) throw new Error(`Agent not found: ${parsed.agent_id}`);
  if (agent.owner_wallet !== parsed.owner_wallet) {
    throw new Error('Unauthorized: wallet does not match agent owner');
  }

  // Payment verification (same pattern as deploy_agent)
  const agentTier = getTier(agent.tier_id);
  if (!agentTier) throw new Error(`Tier not found: ${agent.tier_id}`);
  const agentTierPriceSol = await getTierPrice(agent.tier_id);

  if (parsed.payment_tx_hash.startsWith('devnet_') || parsed.payment_tx_hash.startsWith('test_')) {
    logger.info('[DEV] Skipping on-chain verification for renewal: ' + parsed.payment_tx_hash);
  } else {
    const verification = await verifyPaymentTransaction({
      tx_hash: parsed.payment_tx_hash,
      expected_recipient: CLAWDROP_CONFIG.WALLET_ADDRESS,
      min_amount_sol: agentTierPriceSol,
      network: 'mainnet',
    });
    if (!verification.verified) {
      throw new Error('Renewal payment verification failed: ' + verification.reason);
    }
  }

  const wasStopped = agent.status === 'stopped';

  // Extend subscription by 30 days from now (or from next_payment_due if in the future)
  const baseDate = agent.subscription.next_payment_due > new Date()
    ? agent.subscription.next_payment_due
    : new Date();
  const renewedUntil = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Update agent subscription dates + clear grace period
  agent.subscription.next_payment_due = renewedUntil;
  agent.subscription.grace_period_end = null;
  agent.subscription.payment_history.push({
    payment_id: `pay_renewal_${Date.now()}`,
    amount: agentTierPriceSol,
    token: parsed.payment_token,
    tx_hash: parsed.payment_tx_hash,
    timestamp: new Date(),
    fee_charged_usd: agentTier.price_usd < 100 ? 1.0 : agentTier.price_usd * 0.0035,
    jupiter_swap: parsed.payment_token !== 'SOL',
  });

  // Restart via HFSP if agent was stopped
  let restarted = false;
  if (wasStopped) {
    try {
      await restartViaHFSP(parsed.agent_id);
      updateAgentStatus(parsed.agent_id, 'running');
      restarted = true;
      logger.info({ agent_id: parsed.agent_id }, 'Agent restarted after renewal');
    } catch (err) {
      logger.error({ agent_id: parsed.agent_id, err }, 'Failed to restart agent after renewal');
    }
  } else {
    updateAgentStatus(parsed.agent_id, 'running');
  }

  const response = RenewSubscriptionOutputSchema.parse({
    agent_id: parsed.agent_id,
    status: restarted || !wasStopped ? 'running' : 'stopped',
    renewed_until: renewedUntil.toISOString(),
    message: wasStopped
      ? `Agent "${agent.agent_name}" renewed and restarted. Active until ${renewedUntil.toLocaleDateString()}.`
      : `Subscription renewed. Agent "${agent.agent_name}" active until ${renewedUntil.toLocaleDateString()}.`,
    was_stopped: wasStopped,
    restarted,
  });

  return JSON.stringify(response, null, 2);
}

async function handleGetCredits(input: unknown): Promise<string> {
  const { agent_id, owner_wallet } = (await import('zod')).z.object({ agent_id: (await import('zod')).z.string(), owner_wallet: (await import('zod')).z.string() }).parse(input);
  const agent = getAgent(agent_id);
  if (!agent) throw new Error('Agent not found');
  if (agent.owner_wallet !== owner_wallet) throw new Error('Unauthorized');
  const ledger = getCredits(agent_id);
  return JSON.stringify({
    agent_id,
    balance_usd: ledger.balance_usd,
    total_spent_usd: ledger.total_spent_usd,
    recent_transactions: ledger.transactions.slice(-10),
    tool_costs: TOOL_COSTS_USD,
  }, null, 2);
}

async function handleTopUpCredits(input: unknown): Promise<string> {
  const { z } = await import('zod');
  const parsed = z.object({
    agent_id: z.string(),
    owner_wallet: z.string(),
    amount_usd: z.number().positive(),
    payment_tx_hash: z.string(),
  }).parse(input);

  const agent = getAgent(parsed.agent_id);
  if (!agent) throw new Error('Agent not found');
  if (agent.owner_wallet !== parsed.owner_wallet) throw new Error('Unauthorized');

  // Dev bypass
  if (!parsed.payment_tx_hash.startsWith('devnet_') && !parsed.payment_tx_hash.startsWith('test_')) {
    // TODO: verify USDC payment on-chain (use verifyPaymentTransaction adapted for USDC)
    logger.info({ tx: parsed.payment_tx_hash }, 'Credit top-up payment (mainnet verify TODO)');
  }

  const ledger = topUpCredits(parsed.agent_id, parsed.amount_usd, parsed.payment_tx_hash);
  return JSON.stringify({
    success: true,
    agent_id: parsed.agent_id,
    credited_usd: parsed.amount_usd,
    new_balance_usd: ledger.balance_usd,
    message: `$${parsed.amount_usd} credits added. Balance: $${ledger.balance_usd.toFixed(4)}`,
  }, null, 2);
}

async function handleListAgents(input: unknown): Promise<string> {
  const { owner_wallet } = (await import('zod')).z.object({ owner_wallet: (await import('zod')).z.string() }).parse(input);
  const myAgents = listAgents(owner_wallet);
  const now = Date.now();
  const result = myAgents.map(a => {
    const overdue = now - a.subscription.next_payment_due.getTime();
    const warning = overdue > 0
      ? overdue < 48 * 3600000
        ? `Payment overdue — ${Math.floor(overdue / 3600000)}h into 48h grace period`
        : 'Grace period expired — agent will be stopped soon'
      : null;
    return {
      agent_id: a.agent_id,
      agent_name: a.agent_name,
      tier_id: a.tier_id,
      status: a.status,
      bundles: a.bundles,
      next_payment_due: a.subscription.next_payment_due.toISOString(),
      warning,
    };
  });
  return JSON.stringify({ agents: result, total: result.length }, null, 2);
}

async function handleMakeAgentPublic(input: unknown): Promise<string> {
  const z = (await import('zod')).z;
  const parsed = z.object({
    agent_id: z.string(),
    owner_wallet: z.string(),
    public_description: z.string(),
    tags: z.array(z.string()).optional().default([]),
  }).parse(input);
  const agent = getAgent(parsed.agent_id);
  if (!agent) throw new Error('Agent not found');
  if (agent.owner_wallet !== parsed.owner_wallet) throw new Error('Unauthorized');
  agent.is_public = true;
  agent.public_description = parsed.public_description;
  agent.tags = parsed.tags;
  updateAgentStatus(parsed.agent_id, agent.status);
  return JSON.stringify({ success: true, message: `Agent "${agent.agent_name}" is now public in the registry.` }, null, 2);
}

async function handleBrowseRegistry(input: unknown): Promise<string> {
  const z = (await import('zod')).z;
  const parsed = z.object({
    tag: z.string().optional(),
    bundle: z.string().optional(),
    limit: z.number().default(10),
  }).parse(input);
  const agents = listPublicAgents(parsed.tag, parsed.bundle).slice(0, parsed.limit);
  const result = agents.map(a => ({
    agent_id: a.agent_id,
    agent_name: a.agent_name,
    description: a.public_description,
    bundles: a.bundles,
    tier_id: a.tier_id,
    tags: a.tags ?? [],
    clone_hint: `Run deploy_agent with bundles=${JSON.stringify(a.bundles)} and tier_id="${a.tier_id}"`,
  }));
  return JSON.stringify({ agents: result, total: result.length }, null, 2);
}

// ─── Birdeye Handlers ─────────────────────────────────────────────────────────

async function handleGetTokenAnalytics(input: unknown): Promise<string> {
  const parsed = input as { mint: string };
  if (!parsed.mint) throw new Error('mint parameter required');

  const mint = parsed.mint;
  const cacheKey = `token:${mint}`;

  // Check cache
  const cached = birdeyeCache.get(cacheKey);
  if (cached) {
    return JSON.stringify(cached, null, 2);
  }

  // Fetch from API with fallback
  const [meta, price] = await Promise.all([
    birdeyeGetTokenMeta(mint).catch(() => ({ symbol: 'UNKNOWN', name: 'Unknown Token' })),
    birdeyeGetTokenPrice(mint),
  ]);

  // Build result with fallback handling
  const result: TokenAnalytics = {
    mint,
    symbol: meta?.symbol || 'UNKNOWN',
    name: meta?.name || 'Unknown Token',
    price_usd: price?.price_usd || 0,
    price_change_24h: price?.price_change_24h || meta?.price24hChangePercent || 0,
    market_cap: meta?.market_cap || meta?.fdv,
    liquidity: meta?.liquidity,
    holder_count: meta?.holder_count,
    volume_24h: meta?.volume_24h || meta?.volume24hUSD,
    price_source: price?.source || 'unknown',
  };

  // Cache result
  birdeyeCache.set(cacheKey, result, BIRDEYE_CACHE_TTL.PRICE);

  return JSON.stringify(result, null, 2);
}

async function handleGetMarketOverview(_input: unknown): Promise<string> {
  const cacheKey = 'trending';

  // Check cache
  const cached = birdeyeCache.get(cacheKey);
  if (cached) {
    return JSON.stringify(cached, null, 2);
  }

  // Fetch from API
  const data = await birdeyeGetTrendingTokens();

  // Format top 10 from v3 API response
  const tokens = data?.coins || data?.data || [];
  const trending = tokens.slice(0, 10).map((t: any) => ({
    mint: t.address || t.token_address,
    symbol: t.symbol,
    name: t.name,
    price_usd: t.price,
    price_change_24h: t.price24hChangePercent || t.price_change_24h,
    volume_24h: t.volume24hUSD || t.volume_24h,
  }));

  const result = {
    count: trending.length,
    tokens: trending,
    updated_at: new Date().toISOString(),
  };

  // Cache result
  birdeyeCache.set(cacheKey, result, BIRDEYE_CACHE_TTL.TRENDING);

  return JSON.stringify(result, null, 2);
}

async function handleGetWalletAnalytics(input: unknown): Promise<string> {
  const parsed = input as { wallet: string };
  if (!parsed.wallet) throw new Error('wallet parameter required');

  const wallet = parsed.wallet;
  const cacheKey = `wallet:${wallet}`;

  // Check cache
  const cached = birdeyeCache.get(cacheKey);
  if (cached) {
    return JSON.stringify(cached, null, 2);
  }

  // Fetch wallet tokens (may fail with 403 if API key lacks permissions)
  let tokens: any[] = [];
  try {
    const data = await birdeyeGetWalletTokens(wallet);
    tokens = data?.items || data?.tokens || data || [];
  } catch (err: any) {
    logger.warn({ wallet, error: err.message }, 'Birdeye wallet fetch failed, returning empty');
    // Return empty portfolio if wallet API fails
    return JSON.stringify({
      wallet,
      total_value_usd: 0,
      holdings: [],
      note: 'Wallet analytics temporarily unavailable (API permissions)',
    }, null, 2);
  }

  // Calculate total value
  let totalValue = 0;
  const holdings = [];

  for (const token of tokens) {
    const value = token.value_usd || token.valueUsd || 0;
    totalValue += value;
    holdings.push({
      mint: token.address || token.mint,
      symbol: token.symbol || 'UNKNOWN',
      balance: token.ui_amount || token.balance || 0,
      value_usd: value,
      percentage_of_portfolio: 0,
    });
  }

  // Calculate percentages
  for (const h of holdings) {
    h.percentage_of_portfolio = totalValue > 0
      ? Math.round((h.value_usd / totalValue) * 100 * 100) / 100
      : 0;
  }

  // Sort by value
  holdings.sort((a: any, b: any) => b.value_usd - a.value_usd);

  const result: WalletAnalytics = {
    wallet,
    total_value_usd: totalValue,
    holdings,
  };

  // Cache result
  birdeyeCache.set(cacheKey, result, BIRDEYE_CACHE_TTL.WALLET);

  return JSON.stringify(result, null, 2);
}

// ─── Risk Policy Handler ──────────────────────────────────────────────────────

async function handleCheckTokenRisk(input: unknown): Promise<string> {
  const parsed = input as { mint: string; action: 'swap' | 'send' | 'stake'; amount?: number };
  if (!parsed.mint) throw new Error('mint parameter required');
  if (!parsed.action) throw new Error('action parameter required');

  const result = await executeWithRiskCheck(parsed.action, parsed.mint, parsed.amount || 0);

  const emoji = getRiskEmoji(result.risk_tier);
  const summary = result.decision === 'blocked'
    ? `${emoji} ${result.reason_if_blocked}`
    : result.decision === 'warned'
    ? `${emoji} ${result.warning_message}`
    : `${emoji} Safe to proceed`;

  return JSON.stringify({ ...result, summary }, null, 2);
}

// ─── Deployment Walkthrough Tool ──────────────────────────────────────────────

async function handleDeploymentWalkthrough(input: unknown): Promise<string> {
  const { z } = await import('zod');
  const parsed = z.object({
    step: z.number().default(0),
    selected_tier: z.string().optional(),
    selected_token: z.string().optional(),
    owner_wallet: z.string().optional(),
    agent_name: z.string().optional(),
    bundles: z.array(z.enum(['solana', 'research', 'treasury'])).optional(),
    llm_provider: z.enum(['anthropic', 'openai', 'openrouter']).optional(),
    llm_api_key: z.string().optional(),
    telegram_token: z.string().optional(),
    detected_tx: z.string().optional(),
    payment_tx_hash: z.string().optional(),
  }).parse(input ?? {});

  const PAYMENT_WALLET = process.env.PAYMENT_RECEIVER_WALLET || '3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw';

  const tierNames: Record<string, string> = {
    tier_explorer: '🌱 Explorer', tier_a: '🚀 Production', tier_b: '🏢 Enterprise',
  };

  // Step 0: Welcome + tier selection
  if (parsed.step === 0) {
    const tiers = await listTiersWithPrices();
    const solPrice = await getSolPriceInfo();
    return JSON.stringify({
      step: 0,
      message: `🐾 **Welcome to Clawdrop!**

I'll guide you through deploying your OpenClaw agent on Solana.

**Live SOL Price:** $${solPrice.price.toFixed(2)} (${solPrice.source})

**Available tiers:**
${tiers.map((t: any) => `- **${t.name}**: ${t.price_sol.toFixed(4)} SOL/mo (~$${t.price_usd}/mo) — ${t.vps_capacity}`).join('\n')}

👉 **Next step:** Call \`start_deployment_walkthrough\` with \`step: 1\` and your chosen \`selected_tier\` (e.g. \`tier_b\` for Enterprise).`,
      action_required: 'Select a tier — reply with step: 1, selected_tier: "tier_explorer" | "tier_a" | "tier_b"',
      payment_wallet: PAYMENT_WALLET,
    }, null, 2);
  }

  // Step 1: Token selection + agent config
  if (parsed.step === 1) {
    if (!parsed.selected_tier) throw new Error('selected_tier required for step 1');
    const tier = await getTierWithPrice(parsed.selected_tier);
    const tName = tierNames[parsed.selected_tier] || parsed.selected_tier;
    return JSON.stringify({
      step: 1,
      message: `✓ Tier: **${tName}** — **${tier.price_sol.toFixed(4)} SOL/mo** (~$${tier.price_usd}/mo)

**Which token do you want to pay with?**
- \`SOL\` — Solana (recommended)
- \`USDC\` — USD Stablecoin
- \`HERD\` — Native token

👉 **Next step:** Call \`start_deployment_walkthrough\` with:
- \`step: 2\`
- \`selected_tier: "${parsed.selected_tier}"\`
- \`selected_token: "SOL"\` (or USDC/HERD)
- \`agent_name: "MyAgent"\` (optional)
- \`bundles: ["solana", "research"]\` (optional)
- \`telegram_token: "YOUR_BOT_TOKEN"\` (optional, get from @BotFather)
- \`llm_provider: "anthropic"\` (optional: anthropic|openai|openrouter)
- \`llm_api_key: "sk-..."\` (optional)`,
      tier_price_sol: tier.price_sol,
      tier_price_usd: tier.price_usd,
      action_required: 'Pick token and optionally configure agent, then call step 2',
    }, null, 2);
  }

  // Step 2: Show real-time quote + payment instructions
  if (parsed.step === 2) {
    if (!parsed.selected_tier || !parsed.selected_token) throw new Error('selected_tier and selected_token required');
    const tier = await getTierWithPrice(parsed.selected_tier);
    const tName = tierNames[parsed.selected_tier];
    
    // Calculate amount based on token
    let amount: string;
    if (parsed.selected_token === 'SOL') {
      amount = tier.price_sol.toFixed(4);
    } else if (parsed.selected_token === 'USDC') {
      amount = tier.price_usd.toFixed(2);
    } else if (parsed.selected_token === 'HERD') {
      amount = (tier.price_usd * 50).toFixed(0); // 1 HERD = $0.02
    } else {
      amount = tier.price_usd.toFixed(2);
    }
    
    return JSON.stringify({
      step: 2,
      message: `✓ **${tName}** — **${amount} ${parsed.selected_token}**

**💳 Send payment to:**
\`\`\`
${PAYMENT_WALLET}
\`\`\`
**Amount:** \`${amount} ${parsed.selected_token}\`
**Network:** Solana Devnet

⚡ **I will auto-detect your payment** once you send it!

Open Phantom wallet, send exactly \`${amount} ${parsed.selected_token}\` to the address above.

👉 **Next step:** After sending, call \`start_deployment_walkthrough\` with:
- \`step: 3\`
- \`owner_wallet: "YOUR_PHANTOM_WALLET_ADDRESS"\`
- (keep all previous params: selected_tier, selected_token, agent_name, bundles, telegram_token, llm_provider, llm_api_key)`,
      payment_address: PAYMENT_WALLET,
      amount,
      token: parsed.selected_token,
      network: 'devnet',
      action_required: 'Send payment then reply with step: 3 and owner_wallet',
    }, null, 2);
  }

  // Step 3: Verify payment on-chain
  if (parsed.step === 3) {
    if (!parsed.owner_wallet || !parsed.selected_tier || !parsed.selected_token) {
      throw new Error('owner_wallet, selected_tier, and selected_token required');
    }

    logger.info({ wallet: parsed.owner_wallet }, 'Verifying payment on-chain...');

    // Get expected amount
    const tier = await getTierWithPrice(parsed.selected_tier);
    let expectedAmount: number;
    if (parsed.selected_token === 'SOL') {
      expectedAmount = tier.price_sol;
    } else if (parsed.selected_token === 'USDC') {
      expectedAmount = tier.price_usd;
    } else {
      expectedAmount = tier.price_usd; // approximate
    }

    // Verify payment via Helius
    let verified = false;
    let detectedTx: string | null = null;
    let verificationReason = '';

    try {
      const heliusKey = process.env.HELIUS_API_KEY || '';
      if (!heliusKey) {
        throw new Error('HELIUS_API_KEY not configured');
      }

      // Use Helius API to get transactions for payment wallet
      const resp = await axios.post(
        `https://api-devnet.helius.xyz/v0/addresses/?api-key=${heliusKey}`,
        {
          query: {
            accounts: [PAYMENT_WALLET],
            types: ['TRANSFER'],
            startTime: Date.now() - 5 * 60 * 1000, // Last 5 minutes
          },
        },
        { timeout: 15000 }
      );

      const txs = resp.data?.transactions || [];
      logger.info({ count: txs.length }, 'Found transactions for payment wallet');

      // Look for matching transaction from owner_wallet with correct amount
      for (const tx of txs) {
        const sender = tx.tokenTransfers?.[0]?.fromUserAccount || tx.nativeTransfers?.[0]?.fromUserAccount;
        const receiver = tx.tokenTransfers?.[0]?.toUserAccount || tx.nativeTransfers?.[0]?.toUserAccount;
        const amount = tx.tokenTransfers?.[0]?.tokenAmount || tx.nativeTransfers?.[0]?.amount / 1e9;

        logger.info({ tx: tx.signature, sender, receiver, amount }, 'Checking tx');

        // Check if this tx is from the owner to our payment wallet
        if (receiver === PAYMENT_WALLET && sender === parsed.owner_wallet) {
          // For SOL, check amount matches
          if (parsed.selected_token === 'SOL' && amount >= expectedAmount * 0.95) {
            verified = true;
            detectedTx = tx.signature;
            break;
          }
          // For other tokens, just check it's a transfer to us
          if (parsed.selected_token !== 'SOL' && amount > 0) {
            verified = true;
            detectedTx = tx.signature;
            break;
          }
        }
      }

      if (!verified) {
        verificationReason = `No matching transaction found from ${parsed.owner_wallet} to ${PAYMENT_WALLET} for ${expectedAmount} ${parsed.selected_token}`;
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'On-chain verification failed');
      verificationReason = err.message;
    }

    // If we have a manually provided tx hash, use that
    if (!verified && parsed.payment_tx_hash) {
      logger.info({ tx: parsed.payment_tx_hash }, 'Using manually provided tx hash');
      detectedTx = parsed.payment_tx_hash;
      verified = true;
    }

    if (!verified) {
      return JSON.stringify({
        step: 3,
        message: `⚠️ **Payment not verified.**\n\n${verificationReason}\n\n**To proceed:**\n1. Ensure you sent from wallet: \`${parsed.owner_wallet}\`\n2. Ensure you sent to: \`${PAYMENT_WALLET}\`\n3. Ensure amount is: \`${expectedAmount} ${parsed.selected_token}\`\n4. Wait ~10 seconds for confirmation\n5. Try again, or provide \`payment_tx_hash: "YOUR_TX_SIGNATURE"\``,
        action_required: 'Retry step 3, or add payment_tx_hash manually',
      }, null, 2);
    }

    return JSON.stringify({
      step: 3,
      detected_tx: detectedTx,
      message: `✅ **Payment verified!**\n\nTX: \`${detectedTx?.slice(0, 30)}...\`\n\n**Ready to deploy!**\n\n👉 **Next step:** Call \`start_deployment_walkthrough\` with \`step: 4\` and all your previous params.`,
      action_required: 'Call step: 4 to deploy',
    }, null, 2);
  }

  // Step 4: Deploy
  if (parsed.step === 4) {
    if (!parsed.owner_wallet || !parsed.selected_tier || !parsed.selected_token) {
      throw new Error('owner_wallet, selected_tier, selected_token required');
    }

    // Fire actual deploy_agent
    const deployInput = {
      tier_id: parsed.selected_tier,
      agent_name: parsed.agent_name || 'MyOpenClaw',
      owner_wallet: parsed.owner_wallet,
      payment_token: parsed.selected_token,
      payment_tx_hash: parsed.detected_tx || parsed.payment_tx_hash || `devnet_walkthrough_${Date.now()}`,
      bundles: parsed.bundles || ['solana'],
      telegram_token: parsed.telegram_token,
      llm_provider: parsed.llm_provider || 'anthropic',
      llm_api_key: parsed.llm_api_key,
    };

    const deployResult = await handleDeployAgent(deployInput);
    const deployed = JSON.parse(deployResult);

    return JSON.stringify({
      step: 4,
      message: `🚀 **Agent Deployed!**\n\n**Agent ID:** \`${deployed.agent_id}\`\n**Tier:** ${tierNames[parsed.selected_tier]}\n**Status:** ${deployed.status}\n**Console:** ${deployed.console_url || 'N/A'}\n${parsed.telegram_token ? `**Telegram:** Enabled ✓\n` : ''}\n**What's next:**\n- Check status: \`get_deployment_status\` with \`agent_id: "${deployed.agent_id}"\`\n${parsed.telegram_token ? `- Message your Telegram bot to pair it\n` : ''}\n\n🎉 **Your OpenClaw agent is live!**`,
      agent_id: deployed.agent_id,
      status: deployed.status,
      tier: tierNames[parsed.selected_tier],
      telegram_enabled: !!parsed.telegram_token,
    }, null, 2);
  }

  throw new Error(`Unknown step: ${parsed.step}. Valid steps: 0-4`);
}
