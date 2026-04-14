import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const authAPI = {
  emailSignup: (email: string, password: string, firstName: string) =>
    client.post('/api/v1/auth/email-signup', { email, password, firstName }),
  emailLogin: (email: string, password: string) =>
    client.post('/api/v1/auth/email-login', { email, password }),
  phantomVerify: (publicKeyBase58: string, signedMessageBase64: string, email?: string) =>
    client.post('/api/v1/auth/phantom-verify', { publicKeyBase58, signedMessageBase64, email }),
  getSolanaPayQR: () =>
    client.post('/api/v1/auth/solana-pay-qr', {}),
  verifyPayment: (paymentId: string, transactionSignature: string) =>
    client.post('/api/v1/auth/verify-payment', { paymentId, transactionSignature }),
};

export const agentAPI = {
  listAgents: () =>
    client.get('/api/v1/agents'),
  createAgent: (data: {
    name: string;
    provider: string;
    model: string;
    botToken: string;
    openaiApiKey?: string;
    anthropicApiKey?: string;
    openrouterApiKey?: string;
    kimiApiKey?: string;
  }) =>
    client.post('/api/v1/agents', data),
  getAgent: (id: string) =>
    client.get(`/api/v1/agents/${id}`),
  pairAgent: (id: string, pairingCode: string) =>
    client.post(`/api/v1/agents/${id}/pair`, { pairingCode }),
  deleteAgent: (id: string) =>
    client.delete(`/api/v1/agents/${id}`),
};

export const userAPI = {
  getProfile: () =>
    client.get('/api/v1/user/profile'),
};
