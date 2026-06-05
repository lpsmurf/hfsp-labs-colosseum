// ─── Core domain types ────────────────────────────────────────────────────────

export type AgentStatus = 'active' | 'paused' | 'stopped';

export interface Agent {
  id: string;
  name: string;
  walletAddress: string;
  status: AgentStatus;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

export type SkillProduct = 'vpn-x402' | 'gnosis-card' | 'vps-x402' | 'custom' | 'marketplace';

export interface Skill {
  id: string;
  agentId: string;
  product: SkillProduct;
  name: string;
  enabled: boolean;
  spendCapUsdc: number;      // max USDC this skill can spend per period
  autoApproveUsdc: number;   // auto-approve payments under this amount
  periodSeconds: number;     // cap resets every N seconds (e.g. 86400 = daily)
  createdAt: number;
  // populated when product = 'marketplace'
  marketServiceId?: string;
  marketCategory?: string;
}

export type TxStatus = 'success' | 'pending' | 'failed';
export type TxProduct = SkillProduct | 'unknown';

export interface X402Transaction {
  id: string;
  agentId: string;
  signature: string;          // Solana tx signature
  product: TxProduct;
  endpoint: string;           // e.g. /api/card/topup
  amountUsdc: number;
  status: TxStatus;
  blockTime: number;          // unix timestamp
  meta?: string;              // JSON blob: orderId, safeAddress, etc.
}

export interface WalletBalance {
  walletAddress: string;
  solLamports: number;
  usdcAmount: number;
  fetchedAt: number;
}

export interface SpendSummary {
  totalUsdc: number;
  txCount: number;
  byProduct: Record<string, number>;
  last30DaysUsdc: number;
}
