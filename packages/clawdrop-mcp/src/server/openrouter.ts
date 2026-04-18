/**
 * OpenRouter Integration for Phase 4 Week 2
 * 
 * Provides API key provisioning and management:
 * - POST /api/v1/openrouter/provision - Create new API key for user
 * - GET /api/v1/openrouter/keys/:userId - List user's keys
 * - DELETE /api/v1/openrouter/keys/:keyId - Revoke key
 * - GET /api/v1/openrouter/usage/:userId - Get usage stats
 * 
 * Integration with Week 1 webhook flow:
 * When payment confirmed → automatically provision OpenRouter access
 */

import { Router } from 'express';
import axios from 'axios';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import * as phase4Store from '../db/phase4-store';

const router = Router();

// OpenRouter API configuration
const OPENROUTER_API_URL = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY; // Master key for provisioning

/**
 * POST /api/v1/openrouter/provision
 * Create new OpenRouter API key for authenticated user
 * Requires: JWT auth + payment verification
 */
router.post(
  '/provision',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const { tier = 'standard', label = 'HFSP Access' } = req.body;

      // Verify user has active payment
      const transactions = Array.from(phase4Store.getStoreStats().transactions as any)
        .filter((t: any) => t.userId === userId && t.status === 'confirmed');
      
      if (transactions.length === 0) {
        return res.status(402).json({
          error: 'Payment Required',
          message: 'No confirmed payments found. Please complete payment first.'
        });
      }

      // Calculate credits based on tier
      const creditTiers: Record<string, number> = {
        'basic': 50,      // $50 worth
        'standard': 100,  // $100 worth
        'premium': 500,   // $500 worth
        'enterprise': 2000 // $2000 worth
      };

      const credits = creditTiers[tier] || creditTiers.standard;

      // Call OpenRouter API to create key
      // Note: This is a mock implementation - real OpenRouter provisioning
      // would use their partner API if available
      const apiKey = await provisionOpenRouterKey(userId, tier, credits);

      // Store key in database
      const keyRecord = {
        id: `key_${Date.now()}`,
        userId,
        apiKey: apiKey.key,
        tier,
        credits,
        label,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        status: 'active'
      };

      logger.info({
        userId,
        keyId: keyRecord.id,
        tier,
        credits
      }, 'OpenRouter key provisioned');

      res.json({
        success: true,
        key: {
          id: keyRecord.id,
          apiKey: apiKey.key,
          tier,
          credits,
          expiresAt: keyRecord.expiresAt.toISOString()
        },
        usage: {
          endpoint: `${OPENROUTER_API_URL}/chat/completions`,
          documentation: 'https://openrouter.ai/docs'
        }
      });
    } catch (error) {
      logger.error({ error, userId: req.userId }, 'OpenRouter provisioning failed');
      res.status(500).json({
        error: 'Provisioning Failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/v1/openrouter/keys
 * List all OpenRouter keys for authenticated user
 */
router.get(
  '/keys',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      
      // Get keys from database
      // (In real implementation, query from phase4Store or separate key store)
      const keys: any[] = []; // Placeholder

      res.json({
        success: true,
        keys: keys.map(k => ({
          id: k.id,
          tier: k.tier,
          label: k.label,
          createdAt: k.createdAt,
          expiresAt: k.expiresAt,
          status: k.status,
          // Don't return full API key, just masked version
          apiKeyPreview: `${k.apiKey.slice(0, 8)}...${k.apiKey.slice(-4)}`
        }))
      });
    } catch (error) {
      logger.error({ error, userId: req.userId }, 'Key listing failed');
      res.status(500).json({ error: 'Failed to list keys' });
    }
  }
);

/**
 * DELETE /api/v1/openrouter/keys/:keyId
 * Revoke an OpenRouter API key
 */
router.delete(
  '/keys/:keyId',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { keyId } = req.params;
      const userId = req.userId!;

      // Verify key belongs to user
      // (In real implementation, check ownership)
      
      // Revoke via OpenRouter API
      await revokeOpenRouterKey(keyId);

      logger.info({ userId, keyId }, 'OpenRouter key revoked');

      res.json({
        success: true,
        message: 'API key revoked successfully'
      });
    } catch (error) {
      logger.error({ error, keyId: req.params.keyId }, 'Key revocation failed');
      res.status(500).json({ error: 'Failed to revoke key' });
    }
  }
);

/**
 * GET /api/v1/openrouter/usage
 * Get usage statistics for authenticated user
 */
router.get(
  '/usage',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;

      // Fetch usage from OpenRouter
      const usage = await getOpenRouterUsage(userId);

      res.json({
        success: true,
        usage: {
          totalRequests: usage.total_requests || 0,
          totalTokens: usage.total_tokens || 0,
          totalCost: usage.total_cost || 0,
          byModel: usage.by_model || {},
          period: usage.period || '30d'
        }
      });
    } catch (error) {
      logger.error({ error, userId }, 'Usage fetch failed');
      res.status(500).json({ error: 'Failed to fetch usage' });
    }
  }
);

// Mock OpenRouter provisioning functions
// In production, these would call actual OpenRouter partner API

async function provisionOpenRouterKey(
  userId: string,
  tier: string,
  credits: number
): Promise<{ key: string }> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  // Mock implementation - generate key locally
  // In production, call OpenRouter's key creation endpoint
  const mockKey = `sk-or-${Buffer.from(`${userId}:${Date.now()}:${Math.random()}`).toString('base64').slice(0, 32)}`;
  
  logger.info({ userId, tier, credits }, 'Mock OpenRouter key created');
  
  return { key: mockKey };
}

async function revokeOpenRouterKey(keyId: string): Promise<void> {
  logger.info({ keyId }, 'Mock OpenRouter key revoked');
  // In production, call OpenRouter's key revocation endpoint
}

async function getOpenRouterUsage(userId: string): Promise<any> {
  // Mock usage data
  // In production, call OpenRouter's usage API
  return {
    total_requests: 1250,
    total_tokens: 4500000,
    total_cost: 12.50,
    by_model: {
      'anthropic/claude-3.5-sonnet': { requests: 800, tokens: 3200000, cost: 9.60 },
      'openai/gpt-4o': { requests: 450, tokens: 1300000, cost: 2.90 }
    },
    period: '30d'
  };
}

/**
 * Async provisioning triggered by payment webhook
 * Called from webhook handler when payment confirmed
 */
export async function provisionAfterPayment(
  userId: string,
  herdAmount: number
): Promise<{ success: boolean; keyId?: string; error?: string }> {
  try {
    // Determine tier based on payment amount
    let tier = 'standard';
    if (herdAmount >= 2000) tier = 'enterprise';
    else if (herdAmount >= 500) tier = 'premium';
    else if (herdAmount >= 50) tier = 'standard';
    else tier = 'basic';

    logger.info({ userId, herdAmount, tier }, 'Auto-provisioning OpenRouter after payment');

    const apiKey = await provisionOpenRouterKey(userId, tier, herdAmount);

    return {
      success: true,
      keyId: apiKey.key.slice(0, 16) + '...'
    };
  } catch (error) {
    logger.error({ error, userId, herdAmount }, 'Auto-provisioning failed');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export default router;
