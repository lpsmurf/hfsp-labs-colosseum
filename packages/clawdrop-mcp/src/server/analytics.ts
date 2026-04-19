/**
 * Analytics & Reporting Routes
 * 
 * Week 3 Deliverable: Usage analytics and dashboard API
 * - GET /api/v1/analytics/usage - User usage statistics
 * - GET /api/v1/analytics/payments - Payment history
 * - GET /api/v1/analytics/credits - Credit balance & transactions
 * - GET /api/v1/analytics/team - Team usage (if org enabled)
 */

import { Router } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import * as phase4Store from '../db/phase4-store';

const router = Router();

/**
 * GET /api/v1/analytics/usage
 * Get usage analytics for authenticated user
 */
router.get(
  '/usage',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const { period = '30d' } = req.query;

      // Calculate date range
      const days = parseInt(period as string) || 30;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Get user's transactions
      const transactions = Array.from((phase4Store as any).transactions?.values() || [])
        .filter((t: any) => t.userId === userId && t.createdAt >= startDate);

      // Calculate metrics
      const metrics = {
        totalTransactions: transactions.length,
        confirmedTransactions: transactions.filter((t: any) => t.status === 'confirmed').length,
        totalSpent: transactions
          .filter((t: any) => t.status === 'confirmed')
          .reduce((sum: number, t: any) => sum + (t.inputAmount || 0), 0),
        totalHerdReceived: transactions
          .filter((t: any) => t.status === 'confirmed')
          .reduce((sum: number, t: any) => sum + (t.herdAmount || 0), 0),
        byToken: {} as Record<string, { count: number; amount: number }>,
        daily: [] as Array<{ date: string; count: number; amount: number }>,
      };

      // Aggregate by token
      transactions.forEach((t: any) => {
        const token = t.inputToken || 'SOL';
        if (!metrics.byToken[token]) {
          metrics.byToken[token] = { count: 0, amount: 0 };
        }
        metrics.byToken[token].count++;
        metrics.byToken[token].amount += t.inputAmount || 0;
      });

      // Daily breakdown (last 30 days)
      const dailyMap = new Map<string, { count: number; amount: number }>();
      for (let i = 0; i < 30; i++) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        dailyMap.set(d.toISOString().split('T')[0], { count: 0, amount: 0 });
      }

      transactions.forEach((t: any) => {
        const date = new Date(t.createdAt).toISOString().split('T')[0];
        const day = dailyMap.get(date);
        if (day) {
          day.count++;
          day.amount += t.inputAmount || 0;
        }
      });

      metrics.daily = Array.from(dailyMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json({
        success: true,
        period: `${days}d`,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
        metrics,
      });
    } catch (error) {
      logger.error({ error, userId: req.userId }, 'Usage analytics failed');
      res.status(500).json({ error: 'Failed to fetch usage analytics' });
    }
  }
);

/**
 * GET /api/v1/analytics/payments
 * Get payment history for authenticated user
 */
router.get(
  '/payments',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const { page = '1', limit = '20' } = req.query;

      const pageNum = parseInt(page as string) || 1;
      const limitNum = Math.min(parseInt(limit as string) || 20, 100);

      // Get user's transactions
      const allTransactions = Array.from((phase4Store as any).transactions?.values() || [])
        .filter((t: any) => t.userId === userId)
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const total = allTransactions.length;
      const transactions = allTransactions.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      res.json({
        success: true,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
        payments: transactions.map((t: any) => ({
          id: t.id,
          transactionHash: t.transactionHash,
          status: t.status,
          inputToken: t.inputToken,
          inputAmount: t.inputAmount,
          herdAmount: t.herdAmount,
          createdAt: t.createdAt,
          confirmedAt: t.confirmedAt,
        })),
      });
    } catch (error) {
      logger.error({ error, userId: req.userId }, 'Payment history failed');
      res.status(500).json({ error: 'Failed to fetch payment history' });
    }
  }
);

/**
 * GET /api/v1/analytics/credits
 * Get credit balance and transaction history
 */
router.get(
  '/credits',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;

      // Calculate total HERD credits from confirmed transactions
      const transactions = Array.from((phase4Store as any).transactions?.values() || [])
        .filter((t: any) => t.userId === userId && t.status === 'confirmed');

      const totalCredits = transactions.reduce((sum: number, t: any) => sum + (t.herdAmount || 0), 0);
      const totalSpent = transactions.reduce((sum: number, t: any) => sum + (t.inputAmount || 0), 0);

      // Credit transactions (simplified - in production would be separate table)
      const creditTransactions = transactions.map((t: any) => ({
        id: t.id,
        type: 'purchase',
        amount: t.herdAmount,
        cost: t.inputAmount,
        token: t.inputToken,
        status: t.status,
        createdAt: t.createdAt,
      }));

      res.json({
        success: true,
        balance: {
          total: totalCredits,
          available: totalCredits, // In production, subtract used credits
          spent: totalSpent,
        },
        transactions: creditTransactions.slice(0, 50), // Last 50
      });
    } catch (error) {
      logger.error({ error, userId: req.userId }, 'Credit balance failed');
      res.status(500).json({ error: 'Failed to fetch credit balance' });
    }
  }
);

/**
 * POST /api/v1/analytics/credits/topup
 * Top up credits with additional payment
 */
router.post(
  '/credits/topup',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const { amount, paymentToken = 'SOL' } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({
          error: 'Invalid amount',
          message: 'Amount must be greater than 0'
        });
      }

      // In production, this would:
      // 1. Create a payment quote
      // 2. Return payment instructions
      // 3. Wait for webhook confirmation
      // 4. Add credits to balance

      // Mock response for now
      const quote = {
        id: `topup_${Date.now()}`,
        userId,
        amount,
        paymentToken,
        estimatedCost: amount * 0.0001, // Mock rate: 1 HERD = $0.0001
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      logger.info({ userId, amount, paymentToken }, 'Credit top-up initiated');

      res.json({
        success: true,
        message: 'Top-up quote created. Complete payment to receive credits.',
        quote,
        paymentInstructions: {
          sendTo: process.env.CLAWDROP_WALLET_ADDRESS,
          amount: quote.estimatedCost,
          memo: `[TOPUP_${quote.id}]`,
        },
      });
    } catch (error) {
      logger.error({ error, userId: req.userId }, 'Credit top-up failed');
      res.status(500).json({ error: 'Failed to create top-up' });
    }
  }
);

/**
 * GET /api/v1/analytics/dashboard
 * Get dashboard summary (combined view)
 */
router.get(
  '/dashboard',
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;

      // Get user info
      const user = phase4Store.getUserById(userId);

      // Get summary stats
      const transactions = Array.from((phase4Store as any).transactions?.values() || [])
        .filter((t: any) => t.userId === userId);

      const confirmedTx = transactions.filter((t: any) => t.status === 'confirmed');

      const summary = {
        user: {
          id: userId,
          wallet: user?.walletAddress,
          createdAt: user && (user as any).createdAt,
        },
        stats: {
          totalPayments: transactions.length,
          confirmedPayments: confirmedTx.length,
          totalHerdCredits: confirmedTx.reduce((sum: number, t: any) => sum + (t.herdAmount || 0), 0),
          lastPayment: confirmedTx[0]?.createdAt || null,
        },
        openRouter: {
          // In production, fetch from OpenRouter usage API
          apiCalls: 0,
          tokensUsed: 0,
          estimatedCost: 0,
        },
      };

      res.json({
        success: true,
        dashboard: summary,
      });
    } catch (error) {
      logger.error({ error, userId: req.userId }, 'Dashboard fetch failed');
      res.status(500).json({ error: 'Failed to fetch dashboard' });
    }
  }
);

export default router;
