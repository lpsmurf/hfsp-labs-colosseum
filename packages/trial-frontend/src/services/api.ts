import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { WebAppAuthRequest, WebAppAuthResponse } from '../types/api';
import { Agent, AgentSetupPayload } from '../types/agent';
import type {
  PlatformLoginResponse,
  PlatformAgent,
  Subscription,
  DeployAgentPayload,
  TokenUsage,
  VerifyPaymentPayload,
  PaymentQuote,
} from '../types/api';

// ── Existing Trial API Client ───────────────────────────────────────────────

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api/v1',
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = this.getStoredToken();
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const req = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
        if (error.response?.status === 401 && !req._retry) {
          req._retry = true;
          this.clearAuth();
          window.location.href = '/';
        }
        return Promise.reject(error);
      }
    );
  }

  async authenticateWithTelegram(initData: string): Promise<WebAppAuthResponse> {
    const payload: WebAppAuthRequest = { initData };
    const response = await axios.post<WebAppAuthResponse>('/api/webapp/auth', payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.data.token) {
      this.setStoredToken(response.data.token, response.data.expires_in);
    }
    return response.data;
  }

  private getStoredToken(): string | null {
    return localStorage.getItem('authToken');
  }

  private setStoredToken(token: string, expiresIn: number): void {
    localStorage.setItem('authToken', token);
    localStorage.setItem('authTokenExpiry', (Date.now() + expiresIn * 1000).toString());
  }

  private clearAuth(): void {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authTokenExpiry');
    localStorage.removeItem('authUser');
  }

  isTokenExpired(): boolean {
    const expiry = localStorage.getItem('authTokenExpiry');
    if (!expiry) return true;
    return Date.now() > parseInt(expiry, 10);
  }

  async getAgents(): Promise<{ agents: Agent[] }> {
    const res = await this.client.get<{ agents: Agent[] }>('/agents');
    return res.data;
  }

  async getAgent(id: string): Promise<Agent> {
    const res = await this.client.get<{ agent: Agent }>(`/agents/${id}`);
    return res.data.agent;
  }

  async createAgent(payload: AgentSetupPayload): Promise<Agent> {
    const res = await this.client.post<{ agent: Agent }>('/agents', payload);
    return res.data.agent;
  }

  async deleteAgent(id: string): Promise<{ success: boolean; message: string }> {
    const res = await this.client.delete(`/agents/${id}`);
    return res.data;
  }

  getAxios(): AxiosInstance {
    return this.client;
  }
}

// ── Openclaw Platform API Client ────────────────────────────────────────────

const PLATFORM_TOKEN_KEY = 'platformToken';
const PLATFORM_TOKEN_EXPIRY_KEY = 'platformTokenExpiry';

class PlatformApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api/platform',
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = this.getToken();
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          this.clearToken();
        }
        return Promise.reject(error);
      }
    );
  }

  // ── Token helpers ───────────────────────────────────────────────────────

  getToken(): string | null {
    return localStorage.getItem(PLATFORM_TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    const expiry = localStorage.getItem(PLATFORM_TOKEN_EXPIRY_KEY);
    if (!token || !expiry) return false;
    return Date.now() < parseInt(expiry, 10);
  }

  private setToken(token: string, expiresIn: number): void {
    localStorage.setItem(PLATFORM_TOKEN_KEY, token);
    localStorage.setItem(PLATFORM_TOKEN_EXPIRY_KEY, (Date.now() + expiresIn * 1000).toString());
  }

  clearToken(): void {
    localStorage.removeItem(PLATFORM_TOKEN_KEY);
    localStorage.removeItem(PLATFORM_TOKEN_EXPIRY_KEY);
    localStorage.removeItem('platformUser');
  }

  // ── Auth ────────────────────────────────────────────────────────────────

  async loginWithWallet(
    walletAddress: string,
    signature: string,
    message: string
  ): Promise<PlatformLoginResponse> {
    const res = await axios.post<PlatformLoginResponse>('/api/platform/auth/login', {
      wallet_address: walletAddress,
      signature,
      message,
    });
    this.setToken(res.data.token, res.data.expires_in);
    localStorage.setItem('platformUser', JSON.stringify(res.data.user));
    return res.data;
  }

  getStoredUser(): PlatformLoginResponse['user'] | null {
    const raw = localStorage.getItem('platformUser');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  // ── Subscriptions ───────────────────────────────────────────────────────

  async getSubscription(): Promise<Subscription | null> {
    try {
      const res = await this.client.get<{ subscription: Subscription | null }>('/subscriptions');
      return res.data.subscription;
    } catch (err: unknown) {
      const e = err as AxiosError;
      if (e.response?.status === 404) return null;
      throw err;
    }
  }

  // ── Payments ────────────────────────────────────────────────────────────

  async verifyPayment(payload: VerifyPaymentPayload): Promise<{ subscription: Subscription }> {
    const res = await this.client.post<{ subscription: Subscription }>('/payments/verify', payload);
    return res.data;
  }

  async getPaymentQuote(tier: SubscriptionTier): Promise<PaymentQuote> {
    const res = await this.client.get<PaymentQuote>(`/payments/quote?tier=${tier}`);
    return res.data;
  }

  // ── Agents ──────────────────────────────────────────────────────────────

  async deployAgent(payload: DeployAgentPayload): Promise<PlatformAgent> {
    const res = await this.client.post<{ agent: PlatformAgent }>('/agents/deploy', payload);
    return res.data.agent;
  }

  async getAgents(): Promise<PlatformAgent[]> {
    const res = await this.client.get<{ agents: PlatformAgent[] }>('/agents');
    return res.data.agents;
  }

  async getAgent(id: string): Promise<PlatformAgent> {
    const res = await this.client.get<{ agent: PlatformAgent }>(`/agents/${id}`);
    return res.data.agent;
  }

  async stopAgent(id: string): Promise<void> {
    await this.client.delete(`/agents/${id}`);
  }

  // ── Token Usage ─────────────────────────────────────────────────────────

  async getTokenUsage(): Promise<TokenUsage> {
    const res = await this.client.get<{ usage: TokenUsage }>('/usage/tokens');
    return res.data.usage;
  }

  getAxios(): AxiosInstance {
    return this.client;
  }
}

export const apiClient = new ApiClient();
export const platformClient = new PlatformApiClient();
export default ApiClient;
