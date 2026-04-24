/**
 * C1: SolanaAgentKit Integration
 * Wraps sendaifun/solana-agent-kit to power on-chain capabilities
 * for deployed OpenClaw agents and MCP tools.
 */

import { SolanaAgentKit, KeypairWallet } from 'solana-agent-kit';
import TokenPlugin from '@solana-agent-kit/plugin-token';
// DefiPlugin disabled: @meteora-ag/dlmm has broken ESM imports — use direct protocol APIs instead
// MiscPlugin disabled: @coral-xyz/anchor CJS/ESM conflict — use direct Bonfida/RPC APIs instead
import { Keypair, PublicKey } from '@solana/web3.js';
import logger from '../utils/logger.js';

// ─── Capability Sets ────────────────────────────────────────────────────────
// Maps tier capability_bundle → which plugins to load

export const TIER_CAPABILITY_MAP: Record<string, string[]> = {
  // Treasury tiers - need token ops + DeFi yield
  'treasury-ops':            ['token', 'defi', 'misc'],
  'treasury-ops-pro':        ['token', 'defi', 'misc'],

  // Research tiers - need price data + token analytics + trading
  'research-crypto':         ['token', 'defi', 'misc'],
  'research-crypto-pro':     ['token', 'defi', 'misc'],

  // Wallet control tiers - need token transfers + monitoring
  'wallet-controls':         ['token', 'misc'],
  'wallet-controls-enterprise': ['token', 'defi', 'misc'],

  // Travel crypto - need swaps + payments
  'travel-crypto-pro':       ['token', 'defi', 'misc'],

  // DeFi automation - full DeFi stack
  'defi-management':         ['token', 'defi', 'misc'],

  // NFT management
  'nft-management':          ['token', 'misc'],

  // Governance
  'governance':              ['token', 'misc'],
};

// ─── Agent Kit Factory ───────────────────────────────────────────────────────

export interface AgentKitConfig {
  privateKey?: string;       // Base58 private key (optional - uses ephemeral if not provided)
  rpcUrl?: string;
  openaiApiKey?: string;
  capabilityBundle?: string; // Which tier bundle to load
}

/**
 * Build a SolanaAgentKit instance with selected plugins
 * based on the capability bundle requested.
 */
export async function buildAgentKit(config: AgentKitConfig): Promise<SolanaAgentKit> {
  const rpcUrl = config.rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

  // Use provided keypair or generate ephemeral one for read-only ops
  let wallet: KeypairWallet;
  if (config.privateKey) {
    try {
      const keypair = Keypair.fromSecretKey(Buffer.from(config.privateKey, 'base64'));
      wallet = new KeypairWallet(keypair, rpcUrl);
    } catch {
      logger.warn('Invalid private key provided, using ephemeral wallet');
      wallet = new KeypairWallet(Keypair.generate(), rpcUrl);
    }
  } else {
    wallet = new KeypairWallet(Keypair.generate(), rpcUrl);
  }

  // Determine which plugins to load
  const bundle = config.capabilityBundle || 'research-crypto';
  const plugins = TIER_CAPABILITY_MAP[bundle] || ['token', 'misc'];

  logger.info({ bundle, plugins }, 'Building agent kit with plugins');

  // Build agent kit with selected plugins
  let agent = new SolanaAgentKit(
    wallet,
    rpcUrl,
    {
      OPENAI_API_KEY: config.openaiApiKey || process.env.OPENAI_API_KEY || '',
    }
  );

  if (plugins.includes('token')) agent = agent.use(TokenPlugin as any);
  // DefiPlugin: use direct Raydium/Jupiter API calls instead
  // MiscPlugin: domain/airdrop features handled via direct API calls in chain-tools.ts

  return agent;
}

// ─── Shared Read-Only Kit ────────────────────────────────────────────────────
// For tools that only need read access (price, TPS, resolve domain)

let _sharedKit: SolanaAgentKit | null = null;

export async function getSharedAgentKit(): Promise<SolanaAgentKit> {
  if (!_sharedKit) {
    _sharedKit = await buildAgentKit({
      capabilityBundle: 'research-crypto',
    });
  }
  return _sharedKit;
}

// ─── Helper: Safe Public Key Parse ──────────────────────────────────────────

export function safePublicKey(address: string): PublicKey | null {
  try {
    return new PublicKey(address);
  } catch {
    return null;
  }
}

// ─── Capability Descriptions ─────────────────────────────────────────────────
// Human-readable descriptions of what each bundle enables

export const CAPABILITY_DESCRIPTIONS: Record<string, string[]> = {
  'treasury-ops': [
    'Monitor wallet balances and SOL holdings',
    'Execute token transfers and payments',
    'Swap tokens via Jupiter aggregator',
    'Track yield opportunities (Raydium, Orca)',
    'Real-time Pyth price feeds',
  ],
  'research-crypto': [
    'Fetch token analytics and on-chain data',
    'Monitor trending tokens and price movements',
    'Analyze wallet portfolios',
    'Resolve Solana Name Service (SNS) domains',
    'Network health monitoring (TPS, slot)',
  ],
  'defi-management': [
    'Auto-rebalance DeFi portfolio positions',
    'Manage Raydium/Orca liquidity pools',
    'Jupiter swap execution',
    'Drift perpetuals and lending',
    'Meteora DLMM pool management',
  ],
  'nft-management': [
    'Mint NFTs via Metaplex',
    'Track NFT portfolio floor prices',
    'Transfer and manage NFT holdings',
    'Compressed NFT (cNFT) airdrops via Light Protocol',
  ],
};
