// STREAM 4: Structured Logging + Correlation IDs (Kimi - Task 4.1)
// Status: STUB - Ready for implementation

import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

// TODO: Task 4.1 - Implement structured logging with correlation IDs
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

const context = new Map<string, string>();

export function setCorrelationId(correlation_id: string) {
  context.set('correlation_id', correlation_id);
}

export function getCorrelationId(): string {
  return context.get('correlation_id') || uuidv4();
}

export default logger;
