/**
 * API Response and Request Type Definitions
 */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface AuthTokenResponse {
  token: string;
  expires_in: number;
  token_type: 'Bearer';
}

export interface WebAppAuthRequest {
  initData: string;
}

export interface WebAppAuthResponse {
  token: string;
  expires_in: number;
  user: {
    id: string;
    telegram_id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
  };
}

export interface PaginationParams {
  page?: number;
  page_size?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

// Provisioning WebSocket Messages
export interface WebSocketMessage<T = any> {
  type: 'provisioning.status' | 'agent.created' | 'agent.updated' | 'error' | 'ping' | 'pong';
  data?: T;
  timestamp: string;
}

export interface ProvisioningStatusMessage {
  agent_id: string;
  status: string;
  progress?: number;
  error?: string;
}

export interface WebSocketConnectPayload {
  token: string;
  tenant_id: string;
}

// ── Openclaw Platform Types ─────────────────────────────────────────────────

export interface PlatformLoginResponse {
  token: string;
  expires_in: number;
  user: {
    id: string;
    wallet_address: string;
    tier: string;
  };
}

export type PlatformAgentStatus = 'deploying' | 'active' | 'stopped' | 'failed';
export type LLMProvider = 'poly' | 'byok' | 'custom';
export type PaymentToken = 'SOL' | 'USDC' | 'USDT' | 'HERD';
export type SubscriptionTier = 'starter' | 'pro';

export interface PlatformAgent {
  id: string;
  name: string;
  status: PlatformAgentStatus;
  deploy_type: string;
  tier: SubscriptionTier;
  llm_provider: LLMProvider;
  llm_model: string | null;
  mcp_port: number | null;
  agent_port: number | null;
  created_at: string;
  token_usage?: {
    input_tokens: number;
    output_tokens: number;
    month: string;
  };
}

export interface Subscription {
  id: string;
  tier: SubscriptionTier;
  status: 'active' | 'cancelled' | 'expired';
  payment_token: PaymentToken;
  amount_per_month: string;
  current_period_start: string;
  current_period_end: string;
}

export interface DeployAgentPayload {
  name: string;
  llm_provider: LLMProvider;
  llm_model?: string;
  provider_name?: string;
  api_key?: string;
  custom_endpoint?: string;
  telegram_bot_token: string;
}

export interface TokenUsage {
  month: string;
  input_tokens: number;
  output_tokens: number;
  budget: number;
  model: string;
}

export interface VerifyPaymentPayload {
  tx_signature: string;
  tier: SubscriptionTier;
  token: PaymentToken;
  wallet_address: string;
}

export interface PaymentQuote {
  tier: SubscriptionTier;
  usd: number;
  recipient: string;
  tokens: {
    SOL: { amount: string; price_usd: number };
    USDC: { amount: string };
    USDT: { amount: string };
    HERD: { amount: string; note?: string };
  };
}
