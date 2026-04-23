/**
 * Payment Routes
 * 
 * Phase 4 Payment Endpoints
 * - GET /api/v1/payment/quote - Get swap quote
 * - POST /api/v1/payment/execute - Execute payment (Week 2)
 */

import { Router } from 'express';
import { nanoid } from 'nanoid';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import logger from '../utils/logger';
import * as phase4Store from '../db/phase4-store';

const router = Router();

/**
 * Get current swap price from Jupiter API
 * Falls back to mock prices if API fails
 */
async function getSwapPrice(inputToken: string): Promise<number> {
  try {
    // Try Jupiter Price API
    const { default: axios } = await import('axios');
    
    // Map common symbols to mint addresses
    const tokenMints: Record<string, string> = {
      'SOL': 'So11111111111111111111111111111111111111112',
      'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenEJw',
      'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    };

    const mint = tokenMints[inputToken.toUpperCase()];
    if (!mint) {
      throw new Error(`Unknown token: ${inputToken}`);
    }

    const response = await axios.get(
      `https://price.jup.ag/v6/price?ids=${mint}`,
      { timeout: 5000 }
    );

    const price = response.data?.data?.[mint]?.price;
    if (price) {
      // Calculate HERD price (mock: 1 HERD = $0.0001)
      const herdPrice = price / 0.0001;
      return 1 / herdPrice; // Return swap rate
    }
    
    throw new Error('No price data from Jupiter');
  } catch (error) {
    logger.warn({ error, token: inputToken }, 'Jupiter API failed, using mock prices');
    
    // Fallback mock prices (SOL → HERD)
    const mockPrices: Record<string, number> = {
      'SOL': 2500,      // 1 SOL = 2500 HERD (at $250/SOL, $0.0001/HERD)
      'USDC': 10000,    // 1 USDC = 10000 HERD
      'USDT': 10000,    // 1 USDT = 10000 HERD
      'BONK': 0.001,    // 1 BONK = 0.001 HERD
    };
    
    return mockPrices[inputToken.toUpperCase()] || 100;
  }
}

/**
 * GET /api/v1/payment/quote
 * Get payment quote for token swap
 * Requires JWT authentication
 */
router.get(
  '/quote',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { inputToken, inputAmount } = req.query;

      // Validate parameters
      if (!inputToken || !inputAmount) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required query parameters: inputToken, inputAmount'
        });
      }

      // Parse amount
      const amount = parseFloat(inputAmount as string);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'inputAmount must be a positive number'
        });
      }

      // Validate token
      const validTokens = ['SOL', 'USDC', 'USDT', 'BONK'];
      if (!validTokens.includes((inputToken as string).toUpperCase())) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Unsupported token: ${inputToken}. Supported: ${validTokens.join(', ')}`
        });
      }

      // Get swap price
      const swapPrice = await getSwapPrice(inputToken as string);
      
      // Calculate HERD amount
      const herdAmount = Math.floor(amount * swapPrice);
      
      // Create quote (valid for 5 minutes)
      const validUntil = new Date(Date.now() + 5 * 60 * 1000);
      const quote = phase4Store.createPaymentQuote({
        quoteId: `quote_${nanoid()}`,
        userId: req.userId!,
        inputToken: (inputToken as string).toUpperCase(),
        inputAmount: amount,
        herdAmount,
        swapPrice,
        validUntil,
      });

      logger.info({
        quoteId: quote.quoteId,
        userId: req.userId,
        input: `${amount} ${inputToken}`,
        output: `${herdAmount} HERD`,
      }, 'Quote generated');

      res.json({
        success: true,
        quoteId: quote.quoteId,
        inputToken: quote.inputToken,
        inputAmount: quote.inputAmount,
        herdAmount: quote.herdAmount,
        swapPrice: quote.swapPrice,
        validUntil: quote.validUntil.toISOString(),
        expiresIn: 300, // seconds
      });
    } catch (error) {
      logger.error({ error, userId: req.userId }, 'Quote generation failed');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to generate quote'
      });
    }
  }
);

/**
 * GET /api/v1/payment/quotes/:quoteId
 * Get existing quote by ID
 */
router.get(
  '/quotes/:quoteId',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { quoteId } = req.params;
      
      const quote = phase4Store.getPaymentQuote(quoteId);
      
      if (!quote) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Quote not found or expired'
        });
      }

      // Verify ownership
      if (quote.userId !== req.userId) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Quote belongs to different user'
        });
      }

      res.json({
        success: true,
        quoteId: quote.quoteId,
        inputToken: quote.inputToken,
        inputAmount: quote.inputAmount,
        herdAmount: quote.herdAmount,
        swapPrice: quote.swapPrice,
        validUntil: quote.validUntil.toISOString(),
      });
    } catch (error) {
      logger.error({ error, quoteId: req.params.quoteId }, 'Quote retrieval failed');
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve quote'
      });
    }
  }
);

/**
 * GET /api/v1/payment/prices
 * Get current token prices (public endpoint)
 */
router.get('/prices', async (req, res) => {
  try {
    const tokens = ['SOL', 'USDC', 'USDT'];
    const prices: Record<string, number> = {};
    
    for (const token of tokens) {
      prices[token] = await getSwapPrice(token);
    }
    
    res.json({
      success: true,
      prices,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error }, 'Price fetch failed');
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch prices'
    });
  }
});

export default router;
