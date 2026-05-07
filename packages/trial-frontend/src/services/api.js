import axios from 'axios';

class ApiClient {
  constructor() {
    this.client = axios.create({
      baseURL: '/api/v1',
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use(
      (config) => {
        const token = this.getStoredToken();
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const req = error.config;
        if (error.response?.status === 401 && req && !req._retry) {
          req._retry = true;
          this.clearAuth();
          window.location.href = '/';
        }
        return Promise.reject(error);
      }
    );
  }

  async authenticateWithTelegram(initData) {
    const response = await axios.post(
      '/api/webapp/auth',
      { initData },
      { headers: { 'Content-Type': 'application/json' } }
    );
    if (response.data.token) {
      this.setStoredToken(response.data.token, response.data.expires_in);
    }
    return response.data;
  }

  getStoredToken() {
    return localStorage.getItem('authToken');
  }

  setStoredToken(token, expiresIn) {
    localStorage.setItem('authToken', token);
    localStorage.setItem('authTokenExpiry', (Date.now() + expiresIn * 1000).toString());
  }

  clearAuth() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authTokenExpiry');
    localStorage.removeItem('authUser');
  }

  isTokenExpired() {
    const expiry = localStorage.getItem('authTokenExpiry');
    if (!expiry) return true;
    return Date.now() > parseInt(expiry, 10);
  }

  async getAgents() {
    const res = await this.client.get('/agents');
    return res.data;
  }

  async getAgent(id) {
    const res = await this.client.get(`/agents/${id}`);
    return res.data.agent;
  }

  async createAgent(payload) {
    const res = await this.client.post('/agents', payload);
    return res.data.agent;
  }

  async deleteAgent(id) {
    const res = await this.client.delete(`/agents/${id}`);
    return res.data;
  }

  getAxios() {
    return this.client;
  }
}

const PLATFORM_TOKEN_KEY = 'platformToken';
const PLATFORM_TOKEN_EXPIRY_KEY = 'platformTokenExpiry';

class PlatformApiClient {
  constructor() {
    this.client = axios.create({
      baseURL: '/api/platform',
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use(
      (config) => {
        const token = this.getToken();
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.clearToken();
        }
        return Promise.reject(error);
      }
    );
  }

  getToken() {
    return localStorage.getItem(PLATFORM_TOKEN_KEY);
  }

  isAuthenticated() {
    const token = this.getToken();
    const expiry = localStorage.getItem(PLATFORM_TOKEN_EXPIRY_KEY);
    if (!token || !expiry) return false;
    return Date.now() < parseInt(expiry, 10);
  }

  setToken(token, expiresIn) {
    localStorage.setItem(PLATFORM_TOKEN_KEY, token);
    localStorage.setItem(PLATFORM_TOKEN_EXPIRY_KEY, (Date.now() + expiresIn * 1000).toString());
  }

  clearToken() {
    localStorage.removeItem(PLATFORM_TOKEN_KEY);
    localStorage.removeItem(PLATFORM_TOKEN_EXPIRY_KEY);
    localStorage.removeItem('platformUser');
  }

    async loginWithWallet(walletAddress, signature, message) {
        const res = await axios.post('/api/platform/auth/login', {
            wallet_address: walletAddress,
            signature,
            message,
        });
    this.setToken(res.data.token, res.data.expires_in);
    localStorage.setItem('platformUser', JSON.stringify(res.data.user));
    return res.data;
  }

  getStoredUser() {
    const raw = localStorage.getItem('platformUser');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async getSubscription() {
    try {
      const res = await this.client.get('/subscriptions');
      return res.data.subscription;
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  async verifyPayment(payload) {
    const res = await this.client.post('/payments/verify', payload);
    return res.data;
  }

  async getPaymentQuote(tier) {
    const res = await this.client.get(`/payments/quote?tier=${tier}`);
    return res.data;
  }

  async deployAgent(payload) {
    const res = await this.client.post('/agents/deploy', payload);
    return res.data.agent;
  }

  async getAgents() {
    const res = await this.client.get('/agents');
    return res.data.agents;
  }

  async getAgent(id) {
    const res = await this.client.get(`/agents/${id}`);
    return res.data.agent;
  }

  async stopAgent(id) {
    await this.client.delete(`/agents/${id}`);
  }

  async getTokenUsage() {
    const res = await this.client.get('/usage/tokens');
    return res.data.usage;
  }

  getAxios() {
    return this.client;
  }
}

export const apiClient = new ApiClient();
export const platformClient = new PlatformApiClient();
export default ApiClient;
