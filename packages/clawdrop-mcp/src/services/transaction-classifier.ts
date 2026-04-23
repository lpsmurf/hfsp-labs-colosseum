/**
 * Transaction Classifier
 * 
 * Semantically classifies transactions as swap, flight, or transfer
 * based on request content, keywords, and context.
 * 
 * Returns classification type and confidence score for audit trails.
 */

import { Request } from 'express';
import logger from '../utils/logger';

export interface TransactionClassification {
  type: 'swap' | 'flight' | 'transfer';
  confidence: number;
  reasoning: string;
}

/**
 * Keywords that indicate transaction type
 */
const KEYWORD_PATTERNS = {
  swap: [
    'swap', 'exchange', 'trade', 'dex', 'liquidity',
    'pool', 'route', 'jupiter', 'raydium',
    'sell', 'buy', 'convert', 'from', 'to'
  ],
  flight: [
    'flight', 'booking', 'travel', 'airline', 'ticket',
    'booking', 'airport', 'departure', 'arrival',
    'duffel', 'amadeus', 'flight_id'
  ],
  transfer: [
    'transfer', 'send', 'receive', 'destination',
    'recipient', 'address', 'wallet', 'amount',
    'move', 'transmit', 'forward'
  ],
};

/**
 * Classify a transaction based on request content
 */
export function classifyTransaction(req: Request): TransactionClassification {
  try {
    const scores = {
      swap: 0,
      flight: 0,
      transfer: 0,
    };

    // Get request content to analyze
    const body = req.body || {};
    const headers = req.headers || {};
    const path = req.path?.toLowerCase() || '';
    const method = req.method?.toUpperCase() || '';

    // 1. Analyze path
    if (path.includes('swap') || path.includes('quote')) scores.swap += 2;
    if (path.includes('flight') || path.includes('booking')) scores.flight += 2;
    if (path.includes('transfer') || path.includes('send')) scores.transfer += 2;

    // 2. Analyze request body keywords
    const bodyStr = JSON.stringify(body).toLowerCase();
    const bodyWords = bodyStr.split(/[\s,":{}[\]]+/);

    for (const word of bodyWords) {
      // Swap keywords
      if (KEYWORD_PATTERNS.swap.includes(word)) {
        scores.swap += 1;
      }
      // Flight keywords
      if (KEYWORD_PATTERNS.flight.includes(word)) {
        scores.flight += 1;
      }
      // Transfer keywords
      if (KEYWORD_PATTERNS.transfer.includes(word)) {
        scores.transfer += 1;
      }
    }

    // 3. Analyze specific fields
    if (body.from_token && body.to_token) scores.swap += 2;
    if (body.input_mint && body.output_mint) scores.swap += 2;
    if (body.amount_sol || body.amount_usd) scores.swap += 1;

    if (body.flight_id || body.booking_id) scores.flight += 3;
    if (body.departure_date || body.airline) scores.flight += 2;

    if (body.recipient_address || body.destination_address) scores.transfer += 2;
    if (body.wallet_address && !body.from_token) scores.transfer += 1;

    // 4. Analyze headers
    const contentType = (headers['content-type'] || '').toLowerCase();
    if (contentType.includes('swap')) scores.swap += 1;
    if (contentType.includes('flight') || contentType.includes('booking')) scores.flight += 1;
    if (contentType.includes('transfer')) scores.transfer += 1;

    // 5. Default based on endpoint
    if (method === 'POST') {
      if (path.includes('/quote') || path.includes('/swap')) scores.swap += 1;
      if (path.includes('/book') || path.includes('/flight')) scores.flight += 1;
      if (!path.includes('swap') && !path.includes('flight')) scores.transfer += 0.5;
    }

    // Normalize scores (0-1)
    const total = Math.max(scores.swap + scores.flight + scores.transfer, 1);
    const normalized = {
      swap: scores.swap / total,
      flight: scores.flight / total,
      transfer: scores.transfer / total,
    };

    // Determine winner
    let type: 'swap' | 'flight' | 'transfer' = 'transfer'; // Default
    let maxScore = normalized.transfer;
    let reasoning = 'default transfer classification';

    if (normalized.swap > maxScore) {
      type = 'swap';
      maxScore = normalized.swap;
      reasoning = `swap detected (score: ${normalized.swap.toFixed(2)})`;
    }

    if (normalized.flight > maxScore) {
      type = 'flight';
      maxScore = normalized.flight;
      reasoning = `flight booking detected (score: ${normalized.flight.toFixed(2)})`;
    }

    // Log classification with confidence
    logger.debug({
      type,
      confidence: maxScore,
      scores: normalized,
      path,
      reasoning,
    }, '[TRANSACTION_ROUTED_' + type.toUpperCase() + ']');

    return {
      type,
      confidence: maxScore,
      reasoning,
    };

  } catch (error) {
    logger.warn({
      error: error instanceof Error ? error.message : String(error),
    }, 'Transaction classification error - defaulting to transfer');

    return {
      type: 'transfer',
      confidence: 0.5,
      reasoning: 'classification error - defaulted to transfer',
    };
  }
}

/**
 * Validate classification confidence is acceptable
 */
export function isConfidentClassification(
  classification: TransactionClassification,
  minConfidence: number = 0.4
): boolean {
  return classification.confidence >= minConfidence;
}

/**
 * Get classification summary for logging
 */
export function summarizeClassification(
  classification: TransactionClassification
): string {
  return `[${classification.type.toUpperCase()}:${(classification.confidence * 100).toFixed(0)}%] ${classification.reasoning}`;
}
