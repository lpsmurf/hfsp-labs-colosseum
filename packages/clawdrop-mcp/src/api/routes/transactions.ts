/**
 * Transaction API Routes
 * 
 * Endpoints for:
 * - Payment quotes (no commitment)
 * - Swaps (token-to-SOL via Jupiter)
 * - Transfers (direct SOL transfers)
 * - Bookings (flights, hotels)
 * 
 * Custom Error Signatures: [TX_API_*], [SWAP_*], [TRANSFER_*], [BOOKING_*]
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import {
  validatePaymentRequest,
  generatePaymentQuote,
  recordTransactionStart,
  executePayment,
  recordTransactionSuccess,
} from '../../middleware/payment';
import { classifyTransaction } from '../../services/transaction-classifier';
import { getTokenPrices, getSwapQuote } from '../../services/payment';
import { 
  getWingHistoryHook,
  searchTransactionsHook,
  getMemoryStatsHook,
} from '../../services/transaction-hooks';
import { MemPalaceClient } from '../../integrations/mempalace';

export const transactionRouter = Router();

// ============================================================================
// GET /api/quote - Generate payment quote without executing
// ============================================================================
transactionRouter.get('/quote', async (req: Request, res: Response) => {
  try {
    const { wallet_address, tier_id, amount_sol, from_token = 'SOL' } = req.query;

    if (!wallet_address || typeof wallet_address !== 'string') {
      return res.status(400).json({
        error: '[TX_API_MISSING_WALLET] wallet_address is required',
      });
    }

    // Get prices
    const prices = await getTokenPrices(['SOL', from_token as string]);

    // Classify transaction
    const classification = await classifyTransaction({
      path: '/api/quote',
      query: req.query,
      body: {},
    });

    logger.info(
      { wallet: wallet_address, classification, tier_id, amount: amount_sol },
      '[TX_API_QUOTE_REQUESTED] Quote request received'
    );

    // Generate quote based on parameters
    let quote: any = {
      wallet_address,
      timestamp: new Date().toISOString(),
      classification,
      expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 min expiry
    };

    if (tier_id && amount_sol) {
      const solAmount = Number(amount_sol);
      quote.type = 'tier_purchase';
      quote.tier_id = tier_id;
      quote.from_token = from_token;
      quote.amount_sol = solAmount;
      quote.from_amount = solAmount * prices[from_token as string] / prices.SOL;
      quote.fee_sol = solAmount * 0.0035; // 0.35% swap fee
      quote.fee_usd = quote.fee_sol * prices.SOL;
      quote.clawdrop_receives = solAmount - quote.fee_sol;

      // Get swap details if not SOL
      if (from_token !== 'SOL') {
        const swapQuote = await getSwapQuote(
          from_token as string,
          'SOL',
          quote.from_amount
        );
        if (swapQuote) {
          quote.swap_quote = swapQuote;
        }
      }
    }

    res.json(quote);
  } catch (error) {
    logger.error({ error }, '[TX_API_QUOTE_ERROR] Quote generation failed');
    res.status(500).json({
      error: '[TX_API_QUOTE_ERROR] Failed to generate quote',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// POST /api/swap - Execute token swap and payment
// ============================================================================
transactionRouter.post(
  '/swap',
  validatePaymentRequest,
  generatePaymentQuote,
  recordTransactionStart,
  executePayment,
  recordTransactionSuccess,
  async (req: Request, res: Response) => {
    try {
      const { wallet_address } = req.body;

      logger.info(
        {
          wallet: wallet_address,
          tx_id: req.clawdrop?.transactionId,
          fee_sol: req.clawdrop?.feeAmount,
        },
        '[SWAP_COMPLETED] Swap transaction completed'
      );

      res.status(200).json({
        success: true,
        transaction_id: req.clawdrop?.transactionId,
        fee: {
          amount_sol: req.clawdrop?.feeAmount,
          amount_usd: req.clawdrop?.feeUsd,
          percentage: '0.35%',
        },
        quote: req.clawdrop?.quote,
        metadata: req.clawdrop?.metadata,
      });
    } catch (error) {
      logger.error({ error }, '[SWAP_ERROR] Swap failed');
      res.status(500).json({
        error: '[SWAP_ERROR] Swap failed',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// ============================================================================
// POST /api/transfer - Direct SOL transfer
// ============================================================================
transactionRouter.post(
  '/transfer',
  validatePaymentRequest,
  generatePaymentQuote,
  recordTransactionStart,
  executePayment,
  recordTransactionSuccess,
  async (req: Request, res: Response) => {
    try {
      const { wallet_address, destination, amount_sol } = req.body;

      if (!destination || !amount_sol || amount_sol <= 0) {
        return res.status(400).json({
          error: '[TRANSFER_INVALID_PARAMS] destination and amount_sol required',
        });
      }

      logger.info(
        {
          from: wallet_address,
          to: destination,
          amount_sol,
          fee_sol: req.clawdrop?.feeAmount,
        },
        '[TRANSFER_COMPLETED] Transfer completed'
      );

      res.status(200).json({
        success: true,
        transaction_id: req.clawdrop?.transactionId,
        from: wallet_address,
        to: destination,
        amount_sol,
        fee: {
          amount_sol: req.clawdrop?.feeAmount,
          amount_usd: req.clawdrop?.feeUsd,
          type: 'flat',
        },
        metadata: req.clawdrop?.metadata,
      });
    } catch (error) {
      logger.error({ error }, '[TRANSFER_ERROR] Transfer failed');
      res.status(500).json({
        error: '[TRANSFER_ERROR] Transfer failed',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// ============================================================================
// POST /api/booking - Flight/hotel booking payment
// ============================================================================
transactionRouter.post(
  '/booking',
  validatePaymentRequest,
  generatePaymentQuote,
  recordTransactionStart,
  executePayment,
  recordTransactionSuccess,
  async (req: Request, res: Response) => {
    try {
      const { wallet_address, booking_type, booking_value_usd } = req.body;

      if (!booking_type || !booking_value_usd || booking_value_usd <= 0) {
        return res.status(400).json({
          error: '[BOOKING_INVALID_PARAMS] booking_type and booking_value_usd required',
        });
      }

      logger.info(
        {
          wallet: wallet_address,
          type: booking_type,
          value_usd: booking_value_usd,
          fee_sol: req.clawdrop?.feeAmount,
        },
        '[BOOKING_COMPLETED] Booking completed'
      );

      res.status(200).json({
        success: true,
        transaction_id: req.clawdrop?.transactionId,
        booking_type,
        booking_value_usd,
        fee: {
          amount_sol: req.clawdrop?.feeAmount,
          amount_usd: req.clawdrop?.feeUsd,
          percentage: '0.5%',
        },
        metadata: req.clawdrop?.metadata,
      });
    } catch (error) {
      logger.error({ error }, '[BOOKING_ERROR] Booking failed');
      res.status(500).json({
        error: '[BOOKING_ERROR] Booking failed',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// ============================================================================
// GET /api/history/:wing - Retrieve transaction history for a wing
// ============================================================================
transactionRouter.get('/history/:wing', async (req: Request, res: Response) => {
  try {
    const { wing } = req.params;
    const { page = '1', limit = '50' } = req.query;

    if (!['swap', 'transfer', 'booking'].includes(wing)) {
      return res.status(400).json({
        error: '[TX_API_INVALID_WING] Invalid wing type',
        valid_wings: ['swap', 'transfer', 'booking'],
      });
    }

    // Get wing history via MemPalace
    const history = await getWingHistoryHook(wing);

    logger.info(
      { wing, transactions: history.transactions?.length || 0 },
      '[TX_API_HISTORY_RETRIEVED] Wing history retrieved'
    );

    res.json({
      wing,
      count: history.transactions?.length || 0,
      transactions: history.transactions || [],
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    logger.error({ error }, '[TX_API_HISTORY_ERROR] Failed to retrieve history');
    res.status(500).json({
      error: '[TX_API_HISTORY_ERROR] Failed to retrieve history',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// GET /api/history/search - Search transaction history
// ============================================================================
transactionRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const { keyword, wing } = req.query;

    if (!keyword || typeof keyword !== 'string') {
      return res.status(400).json({
        error: '[TX_API_SEARCH_MISSING_KEYWORD] keyword query parameter required',
      });
    }

    // Search transactions via MemPalace
    const results = await searchTransactionsHook(keyword);

    // Filter by wing if provided
    let filtered = results.results || [];
    if (wing && typeof wing === 'string') {
      filtered = filtered.filter((tx: any) => tx.wing === wing);
    }

    logger.info(
      { keyword, wing, results: filtered.length },
      '[TX_API_SEARCH_COMPLETED] Transaction search completed'
    );

    res.json({
      keyword,
      wing: wing || 'all',
      count: filtered.length,
      transactions: filtered,
    });
  } catch (error) {
    logger.error({ error }, '[TX_API_SEARCH_ERROR] Search failed');
    res.status(500).json({
      error: '[TX_API_SEARCH_ERROR] Search failed',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// ============================================================================
// GET /api/stats - Transaction statistics and memory summary
// ============================================================================
transactionRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const { wing } = req.query;

    // Get memory stats
    const stats = await getMemoryStatsHook();

    logger.info(
      { wing: wing || 'all', stats },
      '[TX_API_STATS_RETRIEVED] Stats retrieved'
    );

    res.json({
      timestamp: new Date().toISOString(),
      stats,
    });
  } catch (error) {
    logger.error({ error }, '[TX_API_STATS_ERROR] Failed to retrieve stats');
    res.status(500).json({
      error: '[TX_API_STATS_ERROR] Failed to retrieve stats',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default transactionRouter;
