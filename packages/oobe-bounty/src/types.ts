import type { Database } from 'better-sqlite3';

export type AgentId = 'price-monitor' | 'portfolio-analyzer' | 'sentiment-monitor' | 'trending-agent' | 'prediction-markets-agent' | 'news-digest-agent';
export type AceService = 'search' | 'chat' | 'images';
export type SignalAction = 'BUY' | 'SELL' | 'HOLD';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type PaymentStatus = 'pending' | 'confirmed' | 'failed';

export interface AgentDefinition {
  id: AgentId;
  name: string;
  service: AceService;
  capabilities: string[];
  endpoint: string;
  symbol: string;
}

export interface SAPRegistrationResult {
  sapId: string;
  explorerUrl: string;
  pending: boolean;
}

export interface SAPAgent extends AgentDefinition {
  sapId: string | null;
  explorerUrl: string | null;
  running: boolean;
  lastSignalTime: string | null;
}

export interface TradingSignal {
  agentId: AgentId;
  service: AceService;
  action: SignalAction;
  symbol: string;
  target_price: number;
  confidence: number;
  reason: string;
  risk_level: RiskLevel;
  actual_price: number;
  timestamp: string;
  image_url?: string | null;
  headlines?: string[] | null;
  trending_data?: TrendingToken[] | null;
}

export interface TrendingToken {
  rank: number;
  name: string;
  symbol: string;
  change24h: number;
  price: number;
  coingeckoId: string;
}

export interface PaymentRequest {
  agentId: AgentId;
  service: AceService;
  tokensUsed: number;
  solAmount?: number;
}

export interface PaymentResult {
  id: string;
  txSignature: string | null;
  confirmed: boolean;
  solAmount: number;
  status: PaymentStatus;
}

export interface AgentRuntimeContext {
  db: Database;
  intervalMs: number;
  once?: boolean;
}

export interface RunningAgent {
  agentId: AgentId;
  running: boolean;
  stop: () => void;
}
