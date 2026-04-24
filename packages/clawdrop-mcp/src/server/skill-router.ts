/**
 * H3: Skill Router
 * Context-aware capability dispatch — maps user intent to tools.
 * Pattern adapted from sendaifun/solana-new SKILL_ROUTER.md.
 * 
 * Instead of requiring users to know tool names, they describe intent
 * and the router selects the right capability.
 */

import { getCapabilityByTag, CAPABILITIES, Capability } from '../services/capabilities.js';
import logger from '../utils/logger.js';

// ─── Intent → Capability Routing Rules ───────────────────────────────────────

interface RouteRule {
  intent_keywords: string[];
  capability_ids: string[];
  primary_tool: string;
  description: string;
}

export const ROUTING_TABLE: RouteRule[] = [
  // Price & Market Data
  {
    intent_keywords: ['price', 'worth', 'value', 'how much', 'cost', 'rate', 'usd'],
    capability_ids: ['price-feeds'],
    primary_tool: 'get_token_analytics',
    description: 'Fetch current token price from Pyth/Birdeye',
  },
  // Wallet / Portfolio
  {
    intent_keywords: ['portfolio', 'holdings', 'balance', 'wallet', 'how many', 'my tokens'],
    capability_ids: ['wallet-analytics', 'solana-rpc'],
    primary_tool: 'get_wallet_analytics',
    description: 'Analyze wallet portfolio and token holdings',
  },
  // Transfer / Send
  {
    intent_keywords: ['send', 'transfer', 'pay', 'payment', 'move'],
    capability_ids: ['token-operations'],
    primary_tool: 'transfer_sol',
    description: 'Transfer SOL or SPL tokens between wallets',
  },
  // Swap / Trade
  {
    intent_keywords: ['swap', 'trade', 'exchange', 'buy', 'sell', 'convert', 'jupiter'],
    capability_ids: ['jupiter-trading'],
    primary_tool: 'swap_tokens',
    description: 'Execute token swap via Jupiter aggregator',
  },
  // DeFi / Yield
  {
    intent_keywords: ['yield', 'farm', 'lp', 'liquidity', 'pool', 'stake', 'earn', 'apy'],
    capability_ids: ['defi-protocols'],
    primary_tool: 'get_market_overview',
    description: 'Access DeFi protocols for yield and liquidity',
  },
  // NFTs
  {
    intent_keywords: ['nft', 'mint', 'collection', 'digital art', 'metaplex', 'floor'],
    capability_ids: ['nft-toolkit'],
    primary_tool: 'mint_nft',
    description: 'Mint or manage NFTs via Metaplex',
  },
  // Network / Health
  {
    intent_keywords: ['network', 'tps', 'transactions per second', 'health', 'status', 'solana status'],
    capability_ids: ['solana-rpc'],
    primary_tool: 'get_network_status',
    description: 'Check Solana network health and TPS',
  },
  // Domain / SNS
  {
    intent_keywords: ['domain', 'sns', '.sol', 'resolve', 'name service'],
    capability_ids: ['solana-rpc'],
    primary_tool: 'resolve_domain',
    description: 'Resolve Solana Name Service domains',
  },
  // Risk / Security
  {
    intent_keywords: ['risk', 'safe', 'scam', 'rug', 'legit', 'audit', 'honeypot'],
    capability_ids: ['wallet-analytics'],
    primary_tool: 'check_token_risk',
    description: 'Analyze token risk and security metrics',
  },
  // Research / Signals
  {
    intent_keywords: ['research', 'signal', 'trending', 'top tokens', 'alpha', 'opportunity'],
    capability_ids: ['research-signals'],
    primary_tool: 'get_market_overview',
    description: 'Research market signals and trending tokens',
  },
  // Deploy Agent
  {
    intent_keywords: ['deploy', 'create agent', 'new agent', 'launch', 'spin up', 'openclaw'],
    capability_ids: [],
    primary_tool: 'start_deployment_walkthrough',
    description: 'Deploy a new OpenClaw agent',
  },
  // Tier / Pricing
  {
    intent_keywords: ['tier', 'pricing', 'plan', 'subscription', 'how much does', 'cost to deploy'],
    capability_ids: [],
    primary_tool: 'list_tiers',
    description: 'Show available agent tiers and pricing',
  },
];

// ─── Router Functions ─────────────────────────────────────────────────────────

export interface RouteResult {
  matched: boolean;
  primary_tool: string;
  capability_ids: string[];
  confidence: number; // 0-1
  description: string;
  fallback?: string;
}

/**
 * Route user intent to the best-matching tool and capabilities.
 * Returns primary tool to call plus which capabilities are needed.
 */
export function routeIntent(userIntent: string): RouteResult {
  const lower = userIntent.toLowerCase();
  
  let bestMatch: RouteRule | null = null;
  let bestScore = 0;

  for (const rule of ROUTING_TABLE) {
    let score = 0;
    for (const keyword of rule.intent_keywords) {
      if (lower.includes(keyword)) {
        score += 1;
        // Exact word match scores higher
        if (lower.split(/\s+/).includes(keyword)) score += 0.5;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = rule;
    }
  }

  if (!bestMatch || bestScore === 0) {
    logger.info({ intent: userIntent }, 'No route match found, defaulting to list_tiers');
    return {
      matched: false,
      primary_tool: 'list_tiers',
      capability_ids: [],
      confidence: 0,
      description: 'No specific intent matched',
      fallback: 'get_market_overview',
    };
  }

  const confidence = Math.min(bestScore / 3, 1); // Normalize to 0-1

  logger.info({ intent: userIntent, tool: bestMatch.primary_tool, confidence }, 'Intent routed');

  return {
    matched: true,
    primary_tool: bestMatch.primary_tool,
    capability_ids: bestMatch.capability_ids,
    confidence,
    description: bestMatch.description,
  };
}

/**
 * Suggest tools based on a capability bundle (tier).
 * Used to tell agents which tools they should prioritize.
 */
export function getToolSuggestions(tier_id: string): string[] {
  const tierKeywords: Record<string, string[]> = {
    'treasury-agent':       ['balance', 'transfer', 'yield', 'price'],
    'treasury-agent-pro':   ['balance', 'transfer', 'yield', 'price', 'swap'],
    'research-execution':   ['price', 'research', 'trending', 'risk'],
    'research-execution-pro': ['price', 'research', 'trending', 'risk', 'trade'],
    'wallet-policy-mgr':    ['balance', 'risk', 'wallet'],
    'defi-auto-rebalancer': ['swap', 'yield', 'pool', 'price'],
    'nft-portfolio-mgr':    ['nft', 'floor', 'portfolio'],
    'governance-voter':     ['network', 'status'],
  };

  const keywords = tierKeywords[tier_id] || ['price', 'balance'];
  const tools = new Set<string>();

  for (const kw of keywords) {
    const route = routeIntent(kw);
    if (route.matched) tools.add(route.primary_tool);
  }

  return Array.from(tools);
}
