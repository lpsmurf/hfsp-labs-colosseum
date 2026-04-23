/**
 * MemPalace Bridge - Node.js Interface to Local Conversation Memory
 * 
 * Connects Clawdrop to MemPalace for persistent transaction memory.
 * Enables transaction history, agent routing, and multi-wing isolation.
 */

import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';

export interface MemPalaceEntry {
  timestamp: string;
  role: 'user' | 'assistant';
  message: string;
  topic: string;
}

export interface MemPalaceStats {
  total_messages: number;
  topics: Record<string, number>;
  storage_path: string;
}

export interface TransactionMemory extends MemPalaceEntry {
  transaction_id?: string;
  transaction_type?: 'swap' | 'flight' | 'transfer';
  fee_sol?: number;
  fee_usd?: number;
  wallet_address?: string;
  wing?: 'swap' | 'flight' | 'transfer';
  confidence?: number;
}

/**
 * MemPalace Client - HTTP bridge to local memory server
 */
export class MemPalaceClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private retries: number = 3;

  constructor(baseUrl: string = 'http://localhost:8888') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 5000,
    });
  }

  /**
   * Check if MemPalace server is running
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : String(error),
        url: this.baseUrl,
      }, '[MEMPALACE_WARN] Server not reachable');
      return false;
    }
  }

  /**
   * Save a transaction to memory
   */
  async saveTransaction(
    transactionType: 'swap' | 'flight' | 'transfer',
    fee: { sol: number; usd: number },
    wallet: string,
    metadata?: Record<string, unknown>
  ): Promise<MemPalaceEntry | null> {
    try {
      const wing = transactionType; // Wing matches transaction type

      const message = JSON.stringify({
        type: transactionType,
        fee: fee,
        wallet: wallet.substring(0, 8) + '...', // Anonymize wallet
        metadata: metadata || {},
        timestamp: new Date().toISOString(),
      });

      const response = await this.client.post('/api/save', {
        role: 'assistant',
        message: message,
        topic: wing, // Topic = wing for isolation
      });

      logger.info({
        type: transactionType,
        fee_sol: fee.sol,
        wing: wing,
      }, '[MEMPALACE_SAVE] Transaction saved');

      return response.data.entry;

    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : String(error),
        transaction_type: transactionType,
      }, '[MEMPALACE_WARN] Failed to save transaction');
      return null;
    }
  }

  /**
   * Get all transactions for a specific wing
   */
  async getWingTransactions(wing: 'swap' | 'flight' | 'transfer'): Promise<MemPalaceEntry[]> {
    try {
      const response = await this.client.get(`/api/search/topic/${wing}`);
      
      logger.debug({
        wing: wing,
        count: response.data.count,
      }, '[MEMPALACE_SEARCH] Wing transactions retrieved');

      return response.data.results || [];

    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : String(error),
        wing: wing,
      }, '[MEMPALACE_WARN] Failed to retrieve wing transactions');
      return [];
    }
  }

  /**
   * Search transactions by keyword
   */
  async searchTransactions(keyword: string): Promise<MemPalaceEntry[]> {
    try {
      const response = await this.client.post('/api/search/keyword', {
        keyword: keyword,
      });

      logger.debug({
        keyword: keyword,
        count: response.data.count,
      }, '[MEMPALACE_SEARCH] Transactions found');

      return response.data.results || [];

    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : String(error),
        keyword: keyword,
      }, '[MEMPALACE_WARN] Search failed');
      return [];
    }
  }

  /**
   * Get all transaction memory
   */
  async getAllTransactions(): Promise<MemPalaceEntry[]> {
    try {
      const response = await this.client.get('/api/all');

      logger.info({
        total: response.data.total,
      }, '[MEMPALACE_ALL] All transactions retrieved');

      return response.data.conversations || [];

    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : String(error),
      }, '[MEMPALACE_WARN] Failed to retrieve all transactions');
      return [];
    }
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<MemPalaceStats | null> {
    try {
      const response = await this.client.get('/api/stats');

      logger.debug({
        total_messages: response.data.total_messages,
        topics: response.data.topics,
      }, '[MEMPALACE_STATS] Statistics retrieved');

      return response.data;

    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : String(error),
      }, '[MEMPALACE_WARN] Failed to get statistics');
      return null;
    }
  }

  /**
   * Get fee summary for a wing
   */
  async getWingFeeSummary(wing: 'swap' | 'flight' | 'transfer'): Promise<{
    total_transactions: number;
    total_fees_sol: number;
    total_fees_usd: number;
  }> {
    try {
      const transactions = await this.getWingTransactions(wing);
      
      let total_sol = 0;
      let total_usd = 0;

      for (const tx of transactions) {
        try {
          const data = JSON.parse(tx.message);
          if (data.fee) {
            total_sol += data.fee.sol || 0;
            total_usd += data.fee.usd || 0;
          }
        } catch {
          // Skip malformed entries
        }
      }

      const summary = {
        total_transactions: transactions.length,
        total_fees_sol: total_sol,
        total_fees_usd: total_usd,
      };

      logger.info(summary, `[MEMPALACE_SUMMARY] Wing: ${wing}`);

      return summary;

    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : String(error),
        wing: wing,
      }, '[MEMPALACE_WARN] Failed to calculate fee summary');

      return {
        total_transactions: 0,
        total_fees_sol: 0,
        total_fees_usd: 0,
      };
    }
  }
}

/**
 * Singleton instance
 */
let mempalaceInstance: MemPalaceClient | null = null;

export function getMemPalaceClient(): MemPalaceClient {
  if (!mempalaceInstance) {
    mempalaceInstance = new MemPalaceClient();
  }
  return mempalaceInstance;
}

export function setMemPalaceClient(client: MemPalaceClient): void {
  mempalaceInstance = client;
}
