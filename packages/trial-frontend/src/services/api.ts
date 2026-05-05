/**
 * Axios API Client with JWT Authentication
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { WebAppAuthRequest, WebAppAuthResponse } from '../types/api';
import { Agent, AgentSetupPayload } from '../types/agent';

class ApiClient {
  private client: AxiosInstance;
  private refreshTokenPromise: Promise<string> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: '/api/v1',
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Attach JWT to every request
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = this.getStoredToken();
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Auto-logout on persistent 401
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

  // ── Auth ──────────────────────────────────────────────────────────────────

  async authenticateWithTelegram(initData: string): Promise<WebAppAuthResponse> {
    const payload: WebAppAuthRequest = { initData };
    // Telegram auth lives outside /v1
    const response = await axios.post<WebAppAuthResponse>('/api/webapp/auth', payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.data.token) {
      this.setStoredToken(response.data.token, response.data.expires_in);
    }
    return response.data;
  }

  // ── Token helpers ─────────────────────────────────────────────────────────

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

  // ── Agents ────────────────────────────────────────────────────────────────

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

export const apiClient = new ApiClient();
export default ApiClient;
