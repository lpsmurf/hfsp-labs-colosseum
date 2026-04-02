export interface User {
  userId: string;
  email?: string;
  wallet?: string;
  subscription: 'free_trial' | 'pro';
  trialExpiresAt?: string;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: User;
  message?: string;
}

export interface PaymentResponse {
  success: boolean;
  paymentId: string;
  amount: number;
  currency: string;
  qrCode: string;
  solanaPayLink: string;
}

export interface Agent {
  id: string;
  name: string;
  status: 'active' | 'provisioning' | 'error';
  createdAt: string;
  model?: string;
  provider?: string;
}
