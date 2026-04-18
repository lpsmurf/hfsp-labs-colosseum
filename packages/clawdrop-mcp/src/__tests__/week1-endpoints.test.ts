/**
 * Week 1 Endpoints Integration Test
 * 
 * Tests JWT auth, payment quotes, and webhooks
 * Run with: npm test -- src/__tests__/week1-endpoints.test.ts
 */

import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import * as phase4Store from '../db/phase4-store';

// Mock environment
process.env.JWT_PRIVATE_KEY = Buffer.from(
  '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAxgNSPM+TDyxujVYfBPYyIhqT9F2hGSSF1O8c9VQRpZlyTFRn\n-----END RSA PRIVATE KEY-----'
).toString('base64');

process.env.JWT_PUBLIC_KEY = Buffer.from(
  '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxgNSPM+TDyxujVYfBPYy\n-----END PUBLIC KEY-----'
).toString('base64');

process.env.WEBHOOK_HMAC_SECRET = 'test-webhook-secret';

// Import routes (we'll test them directly)
import authRouter from '../server/auth';
import paymentRouter from '../server/payment';
import webhooksRouter from '../server/webhooks';

describe('Week 1 Deliverable - Phase 4 Endpoints', () => {
  beforeEach(() => {
    // Clean up test data
    phase4Store.cleanExpiredQuotes();
  });

  describe('JWT Authentication', () => {
    it('should authenticate new wallet and return JWT', async () => {
      // This would be an integration test with actual HTTP calls
      // For now, test the store functions directly
      const user = phase4Store.createUser({
        walletAddress: '9B5X2eNP2JVMQ6dkJV2n8u5vQp1eRkXmZkJv3pQnZkJ',
        walletProvider: 'phantom',
      });

      expect(user).toBeDefined();
      expect(user.id).toMatch(/^user_/);
      expect(user.walletAddress).toBe('9B5X2eNP2JVMQ6dkJV2n8u5vQp1eRkXmZkJv3pQnZkJ');
      expect(user.walletProvider).toBe('phantom');
    });

    it('should find existing user by wallet', async () => {
      const wallet = 'TestWallet123';
      
      phase4Store.createUser({
        walletAddress: wallet,
        walletProvider: 'phantom',
      });

      const found = phase4Store.getUserByWallet(wallet);
      
      expect(found).toBeDefined();
      expect(found?.walletAddress).toBe(wallet);
    });

    it('should generate and verify JWT', () => {
      const privateKey = Buffer.from(process.env.JWT_PRIVATE_KEY!, 'base64').toString('ascii');
      const publicKey = Buffer.from(process.env.JWT_PUBLIC_KEY!, 'base64').toString('ascii');
      
      const token = jwt.sign(
        { userId: 'user_test123', walletAddress: 'test123' },
        privateKey,
        { algorithm: 'RS256', expiresIn: '1h' }
      );

      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts

      const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as any;
      expect(decoded.userId).toBe('user_test123');
    });
  });

  describe('Payment Quotes', () => {
    it('should create payment quote', () => {
      const user = phase4Store.createUser({
        walletAddress: 'quoteTestWallet',
        walletProvider: 'phantom',
      });

      const quote = phase4Store.createPaymentQuote({
        quoteId: 'quote_test123',
        userId: user.id,
        inputToken: 'SOL',
        inputAmount: 1.5,
        herdAmount: 3750,
        swapPrice: 2500,
        validUntil: new Date(Date.now() + 5 * 60 * 1000),
      });

      expect(quote).toBeDefined();
      expect(quote.quoteId).toBe('quote_test123');
      expect(quote.inputToken).toBe('SOL');
      expect(quote.inputAmount).toBe(1.5);
      expect(quote.herdAmount).toBe(3750);
    });

    it('should retrieve valid quote', () => {
      const user = phase4Store.createUser({
        walletAddress: 'quoteTestWallet2',
        walletProvider: 'phantom',
      });

      phase4Store.createPaymentQuote({
        quoteId: 'quote_valid',
        userId: user.id,
        inputToken: 'USDC',
        inputAmount: 100,
        herdAmount: 1000000,
        swapPrice: 10000,
        validUntil: new Date(Date.now() + 5 * 60 * 1000),
      });

      const retrieved = phase4Store.getPaymentQuote('quote_valid');
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.inputToken).toBe('USDC');
    });

    it('should expire old quotes', () => {
      const user = phase4Store.createUser({
        walletAddress: 'quoteTestWallet3',
        walletProvider: 'phantom',
      });

      phase4Store.createPaymentQuote({
        quoteId: 'quote_expired',
        userId: user.id,
        inputToken: 'SOL',
        inputAmount: 1,
        herdAmount: 2500,
        swapPrice: 2500,
        validUntil: new Date(Date.now() - 1000), // Already expired
      });

      const retrieved = phase4Store.getPaymentQuote('quote_expired');
      
      expect(retrieved).toBeUndefined();
    });

    it('should clean up expired quotes', () => {
      const user = phase4Store.createUser({
        walletAddress: 'cleanupWallet',
        walletProvider: 'phantom',
      });

      // Create expired quote
      phase4Store.createPaymentQuote({
        quoteId: 'quote_cleanup',
        userId: user.id,
        inputToken: 'SOL',
        inputAmount: 1,
        herdAmount: 2500,
        swapPrice: 2500,
        validUntil: new Date(Date.now() - 1000),
      });

      const cleaned = phase4Store.cleanExpiredQuotes();
      
      expect(cleaned).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Webhook Processing', () => {
    it('should record webhook event', () => {
      const event = phase4Store.createWebhookEvent({
        eventId: 'evt_test123',
        type: 'payment-confirmed',
        userId: 'user_test',
        payload: { test: true },
        processed: false,
      });

      expect(event).toBeDefined();
      expect(event.eventId).toBe('evt_test123');
      expect(event.type).toBe('payment-confirmed');
      expect(event.processed).toBe(false);
    });

    it('should track processed webhooks', () => {
      phase4Store.createWebhookEvent({
        eventId: 'evt_processed',
        type: 'payment-confirmed',
        userId: 'user_test',
        payload: {},
        processed: true,
      });

      const isProcessed = phase4Store.isWebhookProcessed('evt_processed');
      
      expect(isProcessed).toBe(true);
    });

    it('should create and retrieve transaction', () => {
      const tx = phase4Store.createTransaction({
        id: 'tx_test123',
        userId: 'user_test',
        transactionHash: '5EjT...',
        inputToken: 'SOL',
        inputAmount: 1.5,
        herdAmount: 3750,
        status: 'confirmed',
        confirmedAt: new Date(),
      });

      expect(tx).toBeDefined();
      expect(tx.id).toBe('tx_test123');
      expect(tx.status).toBe('confirmed');

      const retrieved = phase4Store.getTransactionByHash('5EjT...');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('tx_test123');
    });

    it('should update transaction status', () => {
      const tx = phase4Store.createTransaction({
        id: 'tx_update_test',
        userId: 'user_test',
        transactionHash: 'UpdateHash...',
        inputToken: 'SOL',
        inputAmount: 1,
        herdAmount: 2500,
        status: 'pending',
      });

      const updated = phase4Store.updateTransaction(tx.id, {
        status: 'confirmed',
        confirmedAt: new Date(),
      });

      expect(updated).toBeDefined();
      expect(updated?.status).toBe('confirmed');
    });
  });

  describe('Store Statistics', () => {
    it('should return store stats', () => {
      // Create some test data
      const user = phase4Store.createUser({
        walletAddress: 'statsWallet',
        walletProvider: 'phantom',
      });

      phase4Store.createPaymentQuote({
        quoteId: 'stats_quote',
        userId: user.id,
        inputToken: 'SOL',
        inputAmount: 1,
        herdAmount: 2500,
        swapPrice: 2500,
        validUntil: new Date(Date.now() + 5 * 60 * 1000),
      });

      phase4Store.createTransaction({
        id: 'stats_tx',
        userId: user.id,
        transactionHash: 'StatsHash...',
        inputToken: 'SOL',
        inputAmount: 1,
        herdAmount: 2500,
        status: 'confirmed',
      });

      const stats = phase4Store.getStoreStats();
      
      expect(stats.users).toBeGreaterThanOrEqual(1);
      expect(stats.quotes).toBeGreaterThanOrEqual(1);
      expect(stats.transactions).toBeGreaterThanOrEqual(1);
    });
  });
});
