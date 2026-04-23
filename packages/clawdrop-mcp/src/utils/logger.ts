// STREAM 4: Structured Logging + Correlation IDs (Kimi - Task 4.1)
// Pino logger with correlation ID tracking

import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

// Global context for correlation IDs (async-context would be better for production)
const context = new Map<string, string>();
let globalCorrelationId = '';

// Create base logger with structured output
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      singleLine: false,
    },
  },
});

/**
 * Set correlation ID for current context
 * This ID will be included in all subsequent logs
 */
export function setCorrelationId(correlation_id: string): void {
  globalCorrelationId = correlation_id;
  context.set('correlation_id', correlation_id);
}

/**
 * Get current correlation ID, generating one if needed
 */
export function getCorrelationId(): string {
  if (globalCorrelationId) {
    return globalCorrelationId;
  }
  
  const stored = context.get('correlation_id');
  if (stored) {
    return stored;
  }
  
  const newId = `corr_${uuidv4()}`;
  setCorrelationId(newId);
  return newId;
}

/**
 * Clear correlation ID (useful for ending a context)
 */
export function clearCorrelationId(): void {
  globalCorrelationId = '';
  context.clear();
}

/**
 * Create a child logger with correlation ID automatically added
 */
function createContextLogger() {
  return logger.child({
    correlation_id: getCorrelationId(),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Export wrapped logger methods that automatically include correlation_id
 */
export const log = {
  info: (data: any, msg?: string) => createContextLogger().info(data, msg),
  warn: (data: any, msg?: string) => createContextLogger().warn(data, msg),
  error: (data: any, msg?: string) => createContextLogger().error(data, msg),
  debug: (data: any, msg?: string) => createContextLogger().debug(data, msg),
  trace: (data: any, msg?: string) => createContextLogger().trace(data, msg),
};

export default logger;
