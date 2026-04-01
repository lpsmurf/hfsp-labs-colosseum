/**
 * Axios API Client with JWT Authentication
 * Handles token refresh and API calls
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { WebAppAuthRequest, WebAppAuthResponse } from '../types/api';
import { Agent, AgentSetupPayload, UpdateAgentRequest } from '../types/agent';

interface ApiClientConfig {
  baseURL?: string;
  timeout?: number;
}

class ApiClient {
  private client: AxiosInstance;
  private refreshTokenPromise: Promise<string> | null = null;

  constructor(config: ApiClientConfig = {}) {
    this.client = axios.create({
      baseURL: config.baseURL || '/api',
      timeout: config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for JWT auth
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = this.getStoredToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // If 401 and not a retry, try to refresh token
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            await this.refreshToken();
            const token = this.getStoredToken();
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            // Token refresh failed, clear storage and redirect to login
            this.clearAuth();
            window.location.href = '/';
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Authenticate with Telegram Web App initData
   */
  async authenticateWithTelegram(initData: string): Promise<WebAppAuthResponse> {
    const payload: WebAppAuthRequest = { initData };
    const response = await this.client.post<WebAppAuthResponse>('/webapp/auth', payload);

    if (response.data.token) {
      this.setStoredToken(response.data.token, response.data.expires_in);
    }

    return response.data;
  }

  /**
   * Refresh the JWT token
   */
  private async refreshToken(): Promise<string> {
    // Prevent multiple simultaneous refresh requests
    if (this.refreshTokenPromise) {
      return this.refreshTokenPromise;
    }

    this.refreshTokenPromise = (async () => {
      try {
        const response = await this.client.post<{ token: string; expires_in: number }>('/auth/refresh');
        const { token, expires_in } = response.data;
        this.setStoredToken(token, expires_in);
        this.refreshTokenPromise = null;
        return token;
      } catch (error) {
        this.refreshTokenPromise = null;
        throw error;
      }
    })();

    return this.refreshTokenPromise;
  }

  /**
   * Get stored JWT token
   */
  private getStoredToken(): string | null {
    return localStorage.getItem('authToken');
  }

  /**
   * Set stored JWT token with expiry
   */
  private setStoredToken(token: string, expiresIn: number): void {
    localStorage.setItem('authToken', token);
    const expiryTime = Date.now() + expiresIn * 1000;
    localStorage.setItem('authTokenExpiry', expiryTime.toString());
  }

  /**
   * Clear authentication
   */
  private clearAuth(): void {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authTokenExpiry');
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(): boolean {
    const expiry = localStorage.getItem('authTokenExpiry');
    if (!expiry) return true;
    return Date.now() > parseInt(expiry, 10);
  }

  // Agent API Methods

  /**
   * Get list of agents
   */
  async getAgents(page = 1, pageSize = 20) {
    const response = await this.client.get<{ agents: Agent[]; total: number; page: number; page_size: number }>('/agents', {
      params: { page, page_size: pageSize },
    });
    return response.data;
  }

  /**
   * Get single agent by ID
   */
  async getAgent(id: string): Promise<Agent> {
    const response = await this.client.get<Agent>(`/agents/${id}`);
    return response.data;
  }

  /**
   * Create a new agent
   */
  async createAgent(payload: AgentSetupPayload): Promise<Agent> {
    const response = await this.client.post<Agent>('/agents', payload);
    return response.data;
  }

  /**
   * Update an agent
   */
  async updateAgent(id: string, payload: UpdateAgentRequest): Promise<Agent> {
    const response = await this.client.patch<Agent>(`/agents/${id}`, payload);
    return response.data;
  }

  /**
   * Delete an agent
   */
  async deleteAgent(id: string): Promise<{ success: boolean; message: string }> {
    const response = await this.client.delete(`/agents/${id}`);
    return response.data;
  }

  /**
   * Get tenant info
   */
  async getTenantInfo() {
    const response = await this.client.get('/tenant');
    return response.data;
  }

  /**
   * Get tenant agents with filters
   */
  async searchAgents(filters: { name?: string; status?: string; page?: number; page_size?: number }) {
    const response = await this.client.get('/agents/search', { params: filters });
    return response.data;
  }

  /**
   * Get raw axios instance for advanced usage
   */
  getClient(): AxiosInstance {
    return this.client;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
export default ApiClient;
