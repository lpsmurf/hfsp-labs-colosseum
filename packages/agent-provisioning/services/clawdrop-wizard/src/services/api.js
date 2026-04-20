import axios from 'axios';
const API_BASE = import.meta.env.VITE_API_URL || '';
const client = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' },
});
client.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');
    if (token)
        config.headers.Authorization = `Bearer ${token}`;
    return config;
});
export const authAPI = {
    emailSignup: (email, password, firstName) => client.post('/api/v1/auth/email-signup', { email, password, firstName }),
    emailLogin: (email, password) => client.post('/api/v1/auth/email-login', { email, password }),
    phantomVerify: (publicKeyBase58, signedMessageBase64, email) => client.post('/api/v1/auth/phantom-verify', { publicKeyBase58, signedMessageBase64, email }),
    getSolanaPayQR: () => client.post('/api/v1/auth/solana-pay-qr', {}),
    verifyPayment: (paymentId, transactionSignature) => client.post('/api/v1/auth/verify-payment', { paymentId, transactionSignature }),
};
export const agentAPI = {
    listAgents: () => client.get('/api/v1/agents'),
    createAgent: (data) => client.post('/api/v1/agents', data),
    getAgent: (id) => client.get(`/api/v1/agents/${id}`),
    pairAgent: (id, pairingCode) => client.post(`/api/v1/agents/${id}/pair`, { pairingCode }),
    deleteAgent: (id) => client.delete(`/api/v1/agents/${id}`),
};
export const userAPI = {
    getProfile: () => client.get('/api/v1/user/profile'),
};
