/**
 * H1: Capability Plugin Registry
 * Composable capability system - maps tiers to plugin sets.
 * Each capability is a named module with metadata, tools, and cost.
 */

import logger from '../utils/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Capability {
  id: string;
  name: string;
  description: string;
  tags: string[];          // For skill router matching
  protocols: string[];     // Underlying protocols used
  tools: string[];         // MCP tool names this capability provides
  monthly_cost_usd: number;
  tier_minimum: 'hobbyist' | 'production' | 'enterprise';
}

export interface CapabilityBundle {
  id: string;
  name: string;
  capabilities: string[]; // Capability IDs
  tier_id: string;
}

// ─── Capability Registry ─────────────────────────────────────────────────────

export const CAPABILITIES: Record<string, Capability> = {
  'solana-rpc': {
    id: 'solana-rpc',
    name: 'Solana RPC Access',
    description: 'Direct Solana blockchain access via Helius RPC with fallbacks',
    tags: ['blockchain', 'solana', 'rpc', 'network', 'status'],
    protocols: ['helius', 'solana-mainnet'],
    tools: ['get_network_status', 'get_sol_balance', 'resolve_domain'],
    monthly_cost_usd: 0,
    tier_minimum: 'hobbyist',
  },

  'token-operations': {
    id: 'token-operations',
    name: 'Token Operations',
    description: 'Transfer SOL/SPL tokens, deploy new tokens, check balances',
    tags: ['transfer', 'send', 'token', 'spl', 'payment', 'wallet'],
    protocols: ['solana-agent-kit', 'spl-token'],
    tools: ['transfer_sol', 'deploy_spl_token', 'get_sol_balance'],
    monthly_cost_usd: 0,
    tier_minimum: 'hobbyist',
  },

  'jupiter-trading': {
    id: 'jupiter-trading',
    name: 'Jupiter Swap',
    description: 'Best-price token swaps via Jupiter aggregator',
    tags: ['swap', 'trade', 'exchange', 'dex', 'jupiter', 'buy', 'sell'],
    protocols: ['jupiter'],
    tools: ['swap_tokens'],
    monthly_cost_usd: 0,
    tier_minimum: 'hobbyist',
  },

  'price-feeds': {
    id: 'price-feeds',
    name: 'Real-Time Price Feeds',
    description: 'Live token prices from Pyth, Birdeye, and CoinGecko with 1s latency',
    tags: ['price', 'oracle', 'pyth', 'market', 'rate', 'value', 'usd'],
    protocols: ['pyth', 'birdeye', 'jupiter-price', 'coingecko'],
    tools: ['get_token_analytics', 'get_market_overview', 'get_pyth_price'],
    monthly_cost_usd: 0,
    tier_minimum: 'hobbyist',
  },

  'wallet-analytics': {
    id: 'wallet-analytics',
    name: 'Wallet Analytics',
    description: 'Portfolio analysis, token holdings, and transaction history via Birdeye',
    tags: ['portfolio', 'wallet', 'holdings', 'analytics', 'balance', 'pnl'],
    protocols: ['birdeye', 'helius'],
    tools: ['get_wallet_analytics', 'check_token_risk'],
    monthly_cost_usd: 0,
    tier_minimum: 'hobbyist',
  },

  'defi-protocols': {
    id: 'defi-protocols',
    name: 'DeFi Protocol Access',
    description: 'Raydium, Orca, Meteora, Drift for yield farming and liquidity',
    tags: ['defi', 'yield', 'lp', 'liquidity', 'farming', 'raydium', 'orca', 'meteora', 'drift'],
    protocols: ['raydium', 'orca', 'meteora', 'drift'],
    tools: ['swap_tokens', 'get_market_overview'],
    monthly_cost_usd: 5,
    tier_minimum: 'production',
  },

  'nft-toolkit': {
    id: 'nft-toolkit',
    name: 'NFT Toolkit',
    description: 'Mint, transfer, and track NFTs via Metaplex',
    tags: ['nft', 'mint', 'metaplex', 'collection', 'digital-asset'],
    protocols: ['metaplex', 'solana-agent-kit'],
    tools: ['mint_nft'],
    monthly_cost_usd: 3,
    tier_minimum: 'production',
  },

  'research-signals': {
    id: 'research-signals',
    name: 'Market Research & Signals',
    description: 'On-chain signals, trending tokens, sentiment via Birdeye',
    tags: ['research', 'signals', 'sentiment', 'trending', 'alpha', 'data'],
    protocols: ['birdeye', 'helius'],
    tools: ['get_token_analytics', 'get_market_overview', 'check_token_risk'],
    monthly_cost_usd: 0,
    tier_minimum: 'production',
  },

  'treasury-management': {
    id: 'treasury-management',
    name: 'Treasury Management',
    description: 'Monitor and manage treasury wallets, cash flow, and yield optimization',
    tags: ['treasury', 'cash-flow', 'balance', 'yield', 'finance', 'audit'],
    protocols: ['birdeye', 'helius', 'raydium'],
    tools: ['get_wallet_analytics', 'get_sol_balance', 'transfer_sol', 'swap_tokens'],
    monthly_cost_usd: 5,
    tier_minimum: 'production',
  },

  'governance-tools': {
    id: 'governance-tools',
    name: 'Governance Tools',
    description: 'Monitor DAO proposals and automate voting',
    tags: ['governance', 'dao', 'voting', 'proposal', 'realms'],
    protocols: ['realms', 'helius'],
    tools: ['get_network_status'],
    monthly_cost_usd: 2,
    tier_minimum: 'production',
  },
};

// ─── Tier → Capability Mapping ───────────────────────────────────────────────

export const TIER_CAPABILITIES: Record<string, string[]> = {
  'treasury-agent':          ['solana-rpc', 'token-operations', 'price-feeds', 'wallet-analytics', 'treasury-management'],
  'treasury-agent-pro':      ['solana-rpc', 'token-operations', 'jupiter-trading', 'price-feeds', 'wallet-analytics', 'treasury-management', 'defi-protocols'],
  'research-execution':      ['solana-rpc', 'price-feeds', 'wallet-analytics', 'research-signals', 'jupiter-trading'],
  'research-execution-pro':  ['solana-rpc', 'price-feeds', 'wallet-analytics', 'research-signals', 'jupiter-trading', 'defi-protocols'],
  'wallet-policy-mgr':       ['solana-rpc', 'token-operations', 'wallet-analytics', 'price-feeds'],
  'wallet-policy-enterprise':['solana-rpc', 'token-operations', 'wallet-analytics', 'price-feeds', 'defi-protocols'],
  'travel-crypto-pro':       ['solana-rpc', 'token-operations', 'jupiter-trading', 'price-feeds'],
  'defi-auto-rebalancer':    ['solana-rpc', 'token-operations', 'jupiter-trading', 'price-feeds', 'defi-protocols', 'wallet-analytics'],
  'nft-portfolio-mgr':       ['solana-rpc', 'token-operations', 'nft-toolkit', 'price-feeds', 'wallet-analytics'],
  'governance-voter':        ['solana-rpc', 'governance-tools', 'price-feeds', 'wallet-analytics'],
};

// ─── Lookup Functions ─────────────────────────────────────────────────────────

export function getCapabilitiesForTier(tier_id: string): Capability[] {
  const ids = TIER_CAPABILITIES[tier_id] || [];
  return ids.map(id => CAPABILITIES[id]).filter(Boolean);
}

export function getToolsForTier(tier_id: string): string[] {
  const caps = getCapabilitiesForTier(tier_id);
  const tools = new Set<string>();
  caps.forEach(c => c.tools.forEach(t => tools.add(t)));
  return Array.from(tools);
}

export function getCapabilityByTag(tag: string): Capability[] {
  const lower = tag.toLowerCase();
  return Object.values(CAPABILITIES).filter(cap =>
    cap.tags.some(t => t.includes(lower) || lower.includes(t))
  );
}

export function describeCapabilities(tier_id: string): string {
  const caps = getCapabilitiesForTier(tier_id);
  if (!caps.length) return 'No capabilities configured for this tier.';
  
  return caps.map(c => `• **${c.name}**: ${c.description}`).join('\n');
}

logger.info({ tiers: Object.keys(TIER_CAPABILITIES).length, capabilities: Object.keys(CAPABILITIES).length }, 
  'Capability registry loaded');
