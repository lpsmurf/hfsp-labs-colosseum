/**
 * Transaction Hooks - Lifecycle Management with MemPalace Integration
 * 
 * Hooks into transaction lifecycle to save data to MemPalace for:
 * - Persistent transaction memory
 * - Multi-wing agent isolation
 * - Fee accounting and history
 * - Transaction queries
 */

import { Request, Response } from 'express';
import { getMemPalaceClient } from '../integrations/mempalace';
import { logger } from '../utils/logger';

export interface TransactionContext {
  transaction_id: string;
  transaction_type: 'swap' | 'flight' | 'transfer';
  confidence: number;
  fee_sol: number;
  fee_usd: number;
  wallet_address: string;
  amount?: number;
  status: 'pending' | 'success' | 'failed';
  metadata?: Record<string, unknown>;
}

/**
 * Hook: Before transaction - Log intent to memory
 */
export async function beforeTransactionHook(
  req: Request,
  context: Partial<TransactionContext>
): Promise<void> {
  try {
    if (!req.clawdrop) return;

    const transactionId = generateTransactionId();
    const wing = req.clawdrop.transaction_type;

    logger.info({
      transaction_id: transactionId,
      wing: wing,
      confidence: req.clawdrop.transaction_confidence,
    }, '[MEMPALACE_TX_HOOK] Before transaction');

    // Store transaction ID on request for later use
    (req as any).transactionId = transactionId;
    (req as any).wing = wing;

  } catch (error) {
    logger.warn({
      error: error instanceof Error ? error.message : String(error),
    }, '[MEMPALACE_HOOK_WARN] Before transaction hook failed');
  }
}

/**
 * Hook: After successful transaction - Save to MemPalace
 */
export async function afterTransactionSuccessHook(
  req: Request,
  context: TransactionContext
): Promise<void> {
  try {
    if (!req.clawdrop) return;

    const mempalace = getMemPalaceClient();

    // Check if MemPalace is available
    const healthy = await mempalace.isHealthy();
    if (!healthy) {
      logger.warn({
        wing: context.transaction_type,
      }, '[MEMPALACE_WARN] MemPalace server not available');
      return;
    }

    // Save transaction to MemPalace
    await mempalace.saveTransaction(
      context.transaction_type,
      { sol: context.fee_sol, usd: context.fee_usd },
      context.wallet_address,
      {
        transaction_id: context.transaction_id,
        confidence: context.confidence,
        amount: context.amount,
        timestamp: new Date().toISOString(),
        ...context.metadata,
      }
    );

    logger.info({
      transaction_id: context.transaction_id,
      wing: context.transaction_type,
      fee_sol: context.fee_sol,
    }, '[MEMPALACE_TX_SAVED] Transaction memory stored');

  } catch (error) {
    logger.warn({
      error: error instanceof Error ? error.message : String(error),
      transaction_id: context.transaction_id,
    }, '[MEMPALACE_HOOK_WARN] After transaction hook failed');
  }
}

/**
 * Hook: On transaction error - Log failed attempt
 */
export async function onTransactionErrorHook(
  req: Request,
  context: TransactionContext,
  error: Error
): Promise<void> {
  try {
    if (!req.clawdrop) return;

    const mempalace = getMemPalaceClient();

    // Log failed transaction attempt
    await mempalace.saveTransaction(
      context.transaction_type,
      { sol: context.fee_sol, usd: context.fee_usd },
      context.wallet_address,
      {
        transaction_id: context.transaction_id,
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      }
    );

    logger.warn({
      transaction_id: context.transaction_id,
      wing: context.transaction_type,
      error: error.message,
    }, '[MEMPALACE_TX_ERROR] Transaction failed, saved to memory');

  } catch (hookError) {
    logger.warn({
      error: hookError instanceof Error ? hookError.message : String(hookError),
    }, '[MEMPALACE_HOOK_WARN] Error hook failed');
  }
}

/**
 * Hook: Attach transaction metadata to response
 */
export function attachTransactionMetadataHook(
  req: Request,
  res: Response,
  context: TransactionContext
): void {
  try {
    const transactionId = (req as any).transactionId || context.transaction_id;
    const wing = (req as any).wing || context.transaction_type;

    // Add custom headers
    res.setHeader('X-Transaction-ID', transactionId);
    res.setHeader('X-Wing', wing);
    res.setHeader('X-Memory-Stored', 'true');

    logger.debug({
      transaction_id: transactionId,
      wing: wing,
    }, '[MEMPALACE_METADATA] Transaction metadata attached');

  } catch (error) {
    logger.warn({
      error: error instanceof Error ? error.message : String(error),
    }, '[MEMPALACE_HOOK_WARN] Metadata hook failed');
  }
}

/**
 * Helper: Generate unique transaction ID
 */
function generateTransactionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `${timestamp}-${random}`;
}

/**
 * Query Hook: Get transaction history for wing
 */
export async function getWingHistoryHook(wing: 'swap' | 'flight' | 'transfer'): Promise<{
  wing: string;
  total_transactions: number;
  total_fees_sol: number;
  total_fees_usd: number;
  transactions: any[];
}> {
  try {
    const mempalace = getMemPalaceClient();

    const summary = await mempalace.getWingFeeSummary(wing);
    const transactions = await mempalace.getWingTransactions(wing);

    logger.info({
      wing: wing,
      total: summary.total_transactions,
    }, '[MEMPALACE_HISTORY] Wing history retrieved');

    return {
      wing: wing,
      ...summary,
      transactions: transactions.slice(-10), // Last 10 transactions
    };

  } catch (error) {
    logger.warn({
      error: error instanceof Error ? error.message : String(error),
      wing: wing,
    }, '[MEMPALACE_HOOK_WARN] History query failed');

    return {
      wing: wing,
      total_transactions: 0,
      total_fees_sol: 0,
      total_fees_usd: 0,
      transactions: [],
    };
  }
}

/**
 * Query Hook: Search all transactions
 */
export async function searchTransactionsHook(keyword: string): Promise<{
  keyword: string;
  results_count: number;
  results: any[];
}> {
  try {
    const mempalace = getMemPalaceClient();

    const results = await mempalace.searchTransactions(keyword);

    logger.info({
      keyword: keyword,
      count: results.length,
    }, '[MEMPALACE_QUERY] Search completed');

    return {
      keyword: keyword,
      results_count: results.length,
      results: results,
    };

  } catch (error) {
    logger.warn({
      error: error instanceof Error ? error.message : String(error),
      keyword: keyword,
    }, '[MEMPALACE_HOOK_WARN] Search query failed');

    return {
      keyword: keyword,
      results_count: 0,
      results: [],
    };
  }
}

/**
 * Query Hook: Get memory statistics
 */
export async function getMemoryStatsHook(): Promise<{
  total_transactions: number;
  by_wing: Record<string, number>;
  health: 'ok' | 'unavailable';
}> {
  try {
    const mempalace = getMemPalaceClient();

    const stats = await mempalace.getStats();

    if (!stats) {
      return {
        total_transactions: 0,
        by_wing: {},
        health: 'unavailable',
      };
    }

    logger.info({
      total: stats.total_messages,
      topics: stats.topics,
    }, '[MEMPALACE_STATS] Statistics retrieved');

    return {
      total_transactions: stats.total_messages,
      by_wing: stats.topics,
      health: 'ok',
    };

  } catch (error) {
    logger.warn({
      error: error instanceof Error ? error.message : String(error),
    }, '[MEMPALACE_HOOK_WARN] Stats query failed');

    return {
      total_transactions: 0,
      by_wing: {},
      health: 'unavailable',
    };
  }
}
