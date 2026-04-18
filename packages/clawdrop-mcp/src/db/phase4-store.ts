/**
 * Phase 4 User Store
 * 
 * Simple JSON-file based store for users, quotes, and transactions
 * In production, replace with PostgreSQL or similar
 */

import { logger } from '../utils/logger';

// Types
export interface User {
  id: string;
  walletAddress: string;
  walletProvider: 'phantom' | 'magic-eden' | 'solflare' | 'other';
  email?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentQuote {
  quoteId: string;
  userId: string;
  inputToken: string;
  inputAmount: number;
  herdAmount: number;
  swapPrice: number;
  validUntil: Date;
  createdAt: Date;
}

export interface Transaction {
  id: string;
  userId: string;
  transactionHash: string;
  inputToken: string;
  inputAmount: number;
  herdAmount: number;
  status: 'pending' | 'confirmed' | 'failed';
  confirmedAt?: Date;
  failedAt?: Date;
  error?: string;
  createdAt: Date;
}

export interface WebhookEvent {
  eventId: string;
  type: 'payment-confirmed' | 'payment-failed';
  userId: string;
  payload: any;
  processed: boolean;
  error?: string;
  createdAt: Date;
  processedAt?: Date;
}

// In-memory stores (replace with DB in production)
const users = new Map<string, User>();
const usersByWallet = new Map<string, User>();
const quotes = new Map<string, PaymentQuote>();
const transactions = new Map<string, Transaction>();
const transactionsByHash = new Map<string, Transaction>();
const webhookEvents = new Map<string, WebhookEvent>();

/**
 * User Functions
 */
export function createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): User {
  const user: User = {
    id: userData.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    walletAddress: userData.walletAddress,
    walletProvider: userData.walletProvider,
    email: userData.email,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  users.set(user.id, user);
  usersByWallet.set(user.walletAddress, user);
  
  logger.info({ userId: user.id, wallet: user.walletAddress }, 'User created');
  return user;
}

export function getUserById(userId: string): User | undefined {
  return users.get(userId);
}

export function getUserByWallet(walletAddress: string): User | undefined {
  return usersByWallet.get(walletAddress);
}

export function updateUser(userId: string, updates: Partial<Omit<User, 'id'>>): User | undefined {
  const user = users.get(userId);
  if (!user) return undefined;
  
  Object.assign(user, updates, { updatedAt: new Date() });
  users.set(userId, user);
  
  // Update wallet index if wallet changed
  if (updates.walletAddress) {
    usersByWallet.delete(user.walletAddress);
    usersByWallet.set(updates.walletAddress, user);
  }
  
  return user;
}

/**
 * Quote Functions
 */
export function createPaymentQuote(quoteData: Omit<PaymentQuote, 'createdAt'>): PaymentQuote {
  const quote: PaymentQuote = {
    ...quoteData,
    createdAt: new Date(),
  };
  
  quotes.set(quote.quoteId, quote);
  logger.info({ quoteId: quote.quoteId, userId: quote.userId }, 'Quote created');
  return quote;
}

export function getPaymentQuote(quoteId: string): PaymentQuote | undefined {
  const quote = quotes.get(quoteId);
  
  // Check if expired
  if (quote && new Date() > quote.validUntil) {
    quotes.delete(quoteId);
    return undefined;
  }
  
  return quote;
}

export function deletePaymentQuote(quoteId: string): boolean {
  return quotes.delete(quoteId);
}

export function cleanExpiredQuotes(): number {
  const now = new Date();
  let deleted = 0;
  
  for (const [quoteId, quote] of quotes.entries()) {
    if (now > quote.validUntil) {
      quotes.delete(quoteId);
      deleted++;
    }
  }
  
  if (deleted > 0) {
    logger.info({ count: deleted }, 'Expired quotes cleaned');
  }
  return deleted;
}

// Run cleanup every 5 minutes
setInterval(cleanExpiredQuotes, 5 * 60 * 1000);

/**
 * Transaction Functions
 */
export function createTransaction(txData: Omit<Transaction, 'createdAt'>): Transaction {
  const tx: Transaction = {
    ...txData,
    createdAt: new Date(),
  };
  
  transactions.set(tx.id, tx);
  transactionsByHash.set(tx.transactionHash, tx);
  
  logger.info({ 
    txId: tx.id, 
    userId: tx.userId, 
    hash: tx.transactionHash,
    status: tx.status 
  }, 'Transaction created');
  return tx;
}

export function getTransaction(txId: string): Transaction | undefined {
  return transactions.get(txId);
}

export function getTransactionByHash(hash: string): Transaction | undefined {
  return transactionsByHash.get(hash);
}

export function updateTransaction(
  txId: string, 
  updates: Partial<Omit<Transaction, 'id' | 'createdAt'>>
): Transaction | undefined {
  const tx = transactions.get(txId);
  if (!tx) return undefined;
  
  Object.assign(tx, updates);
  transactions.set(txId, tx);
  
  // Update hash index if hash changed
  if (updates.transactionHash && updates.transactionHash !== tx.transactionHash) {
    transactionsByHash.delete(tx.transactionHash);
    transactionsByHash.set(updates.transactionHash, tx);
  }
  
  return tx;
}

/**
 * Webhook Event Functions
 */
export function createWebhookEvent(eventData: Omit<WebhookEvent, 'createdAt'>): WebhookEvent {
  const event: WebhookEvent = {
    ...eventData,
    createdAt: new Date(),
  };
  
  webhookEvents.set(event.eventId, event);
  logger.info({ eventId: event.eventId, type: event.type }, 'Webhook event created');
  return event;
}

export function getWebhookEvent(eventId: string): WebhookEvent | undefined {
  return webhookEvents.get(eventId);
}

export function updateWebhookEvent(
  eventId: string,
  updates: Partial<Omit<WebhookEvent, 'eventId' | 'createdAt'>>
): WebhookEvent | undefined {
  const event = webhookEvents.get(eventId);
  if (!event) return undefined;
  
  Object.assign(event, updates);
  webhookEvents.set(eventId, event);
  return event;
}

export function isWebhookProcessed(eventId: string): boolean {
  const event = webhookEvents.get(eventId);
  return event?.processed || false;
}

/**
 * Statistics for monitoring
 */
export function getStoreStats(): {
  users: number;
  quotes: number;
  transactions: number;
  webhookEvents: number;
} {
  return {
    users: users.size,
    quotes: quotes.size,
    transactions: transactions.size,
    webhookEvents: webhookEvents.size,
  };
}

export default {
  // Users
  createUser,
  getUserById,
  getUserByWallet,
  updateUser,
  
  // Quotes
  createPaymentQuote,
  getPaymentQuote,
  deletePaymentQuote,
  cleanExpiredQuotes,
  
  // Transactions
  createTransaction,
  getTransaction,
  getTransactionByHash,
  updateTransaction,
  
  // Webhooks
  createWebhookEvent,
  getWebhookEvent,
  updateWebhookEvent,
  isWebhookProcessed,
  
  // Stats
  getStoreStats,
};
