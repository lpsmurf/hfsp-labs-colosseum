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
