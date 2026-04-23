/**
 * OpenRouter Integration Routes
 * 
 * Week 3: OpenRouter API key provisioning and management
 * - POST /api/v1/openrouter/keys - Create new API key
 * - GET /api/v1/openrouter/keys - List user's API keys
 * - DELETE /api/v1/openrouter/keys/:keyId - Revoke API key
 * - GET /api/v1/openrouter/usage - Get usage statistics
 */

import { Router } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// In-memory key store (replace with DB in production)
interface ApiKey {
  id: string;
  userId: string;
  key: string;
  name: string;
  tier: string;
  credits: number;
  createdAt: Date;
  lastUsedAt?: Date;
}

const apiKeys = new Map<string, ApiKey>(); // keyId -> ApiKey
const userKeys = new Map<string, string[]>(); // userId -> keyIds

/**
 * POST /api/v1/openrouter/keys
 * Create a new OpenRouter API key
 */
router.post(
  '/keys',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const { name, tier = 'standard' } = req.body;

      // Check if user has enough credits
      // In production, verify credit balance before provisioning

      // Create key via OpenRouter API (mock for now)
      const keyData = await provisionOpenRouterKey(userId, tier, 1000);

      const apiKey: ApiKey = {
        id: `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        key: keyData.key,
        name: name || `Key ${Date.now()}`,
        tier,
        credits: 1000,
        createdAt: new Date(),
      };

      apiKeys.set(apiKey.id, apiKey);

      // Add to user's keys
      const userKeyList = userKeys.get(userId) || [];
      userKeyList.push(apiKey.id);
      userKeys.set(userId, userKeyList);

      logger.info({ userId, keyId: apiKey.id, tier }, 'OpenRouter API key created');

      res.json({
        success: true,
        key: {
          id: apiKey.id,
          name: apiKey.name,
          tier: apiKey.tier,
          credits: apiKey.credits,
          createdAt: apiKey.createdAt,
          // Only show the full key once on creation
          token: apiKey.key,
        },
      });
    } catch (error) {
      logger.error({ error, userId: req.userId }, 'Key creation failed');
      res.status(500).json({ error: 'Failed to create API key' });
    }
  }
);

/**
 * GET /api/v1/openrouter/keys
 * List user's API keys (without full tokens)
 */
router.get(
  '/keys',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const keyIds = userKeys.get(userId) || [];

      const keys = keyIds
        .map(id => apiKeys.get(id))
        .filter(Boolean)
        .map((key: any) => ({
          id: key.id,
          name: key.name,
          tier: key.tier,
          credits: key.credits,
          createdAt: key.createdAt,
          lastUsedAt: key.lastUsedAt,
          // Mask the actual key
          tokenPreview: key.key.slice(0, 8) + '...' + key.key.slice(-4),
        }));

      res.json({
        success: true,
        keys,
      });
    } catch (error) {
      logger.error({ error, userId: req.userId }, 'Key listing failed');
      res.status(500).json({ error: 'Failed to list API keys' });
    }
  }
);

/**
 * DELETE /api/v1/openrouter/keys/:keyId
 * Revoke an API key
 */
router.delete(
  '/keys/:keyId',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { keyId } = req.params;
      const userId = req.userId!;

      const apiKey = apiKeys.get(keyId);
      if (!apiKey || apiKey.userId !== userId) {
        return res.status(404).json({ error: 'Key not found' });
      }

      // Revoke via OpenRouter API
      await revokeOpenRouterKey(apiKey.key);

      // Remove from stores
      apiKeys.delete(keyId);
      const userKeyList = userKeys.get(userId) || [];
      userKeys.set(userId, userKeyList.filter(id => id !== keyId));

      logger.info({ userId, keyId }, 'OpenRouter API key revoked');

      res.json({
        success: true,
        message: 'API key revoked successfully',
      });
    } catch (error) {
      logger.error({ error, userId: req.userId, keyId: req.params.keyId }, 'Key revocation failed');
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
      logger.error({ error, userId: req.userId }, 'Usage fetch failed');
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