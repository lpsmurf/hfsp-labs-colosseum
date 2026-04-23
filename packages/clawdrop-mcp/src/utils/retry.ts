// STREAM 3: Exponential Backoff + Circuit Breaker (Kimi - Task 3.1)
// Helper functions for retry logic

import { log } from './logger';
import { classifyError } from './errors';

/**
 * Fibonacci backoff sequence (in seconds)
 * [3, 5, 8, 13, 21, 34, 55, 89]
 */
const FIBONACCI_BACKOFF = [3, 5, 8, 13, 21, 34, 55, 89];
const CIRCUIT_BREAKER_THRESHOLD = 5; // Fail after 5 consecutive errors

export interface RetryOptions {
  maxAttempts?: number;
  backoffSequence?: number[];
  circuitBreakerThreshold?: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  attempts: number;
  lastError?: any;
}

/**
 * Execute function with exponential backoff and circuit breaker
 * Returns after: success, max attempts reached, or permanent error
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  name: string,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const maxAttempts = options.maxAttempts || 8; // 8 attempts covers full Fibonacci sequence
  const backoffSequence = options.backoffSequence || FIBONACCI_BACKOFF;
  const threshold = options.circuitBreakerThreshold || CIRCUIT_BREAKER_THRESHOLD;

  let consecutiveErrors = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      log.info(
        {
          operation: name,
          attempt,
          max_attempts: maxAttempts,
        },
        'Attempting operation'
      );

      const result = await fn();

      // Success: reset circuit breaker and return
      consecutiveErrors = 0;
      log.info(
        {
          operation: name,
          attempt,
          success: true,
        },
        'Operation succeeded'
      );

      return {
        success: true,
        result,
        attempts: attempt,
      };
    } catch (error: any) {
      const classification = classifyError(error);

      log.warn(
        {
          operation: name,
          attempt,
          classification,
          error: error.message,
          consecutive_errors: consecutiveErrors + 1,
        },
        'Operation failed'
      );

      // Permanent errors: fail immediately
      if (classification === 'permanent') {
        log.error(
          {
            operation: name,
            attempt,
            error: error.message,
          },
          'Permanent error, stopping retries'
        );

        return {
          success: false,
          error: `Permanent error: ${error.message}`,
          attempts: attempt,
          lastError: error,
        };
      }

      // Circuit breaker: fail if too many consecutive errors
      consecutiveErrors++;
      if (consecutiveErrors >= threshold) {
        log.error(
          {
            operation: name,
            attempt,
            consecutive_errors: consecutiveErrors,
            threshold,
          },
          'Circuit breaker triggered'
        );

        return {
          success: false,
          error: `Circuit breaker triggered after ${consecutiveErrors} consecutive errors`,
          attempts: attempt,
          lastError: error,
        };
      }

      // Transient errors: retry with backoff
      if (attempt < maxAttempts) {
        const backoffSeconds = backoffSequence[attempt - 1] || backoffSequence[backoffSequence.length - 1];

        log.info(
          {
            operation: name,
            attempt,
            next_attempt: attempt + 1,
            backoff_seconds: backoffSeconds,
          },
          'Retrying with backoff'
        );

        await new Promise(resolve => setTimeout(resolve, backoffSeconds * 1000));
      }
    }
  }

  return {
    success: false,
    error: `Max attempts (${maxAttempts}) exceeded`,
    attempts: maxAttempts,
  };
}
