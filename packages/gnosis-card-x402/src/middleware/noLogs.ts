/**
 * Strips PII from request logs. Express uses this as a logger transport.
 * We never log IP addresses, User-Agent strings, or payment signatures.
 */
import type { Request, Response, NextFunction } from 'express';

export function noLogs(_req: Request, _res: Response, next: NextFunction) {
  // Intentionally empty — no request logging
  next();
}

// Safe console wrapper — redacts anything that looks like a Solana address or tx sig
export function safeLog(level: 'info' | 'warn' | 'error', ...args: unknown[]) {
  const redacted = args.map(a =>
    typeof a === 'string'
      ? a.replace(/[1-9A-HJ-NP-Za-km-z]{43,88}/g, '[redacted]')
      : a,
  );
  console[level](...redacted);
}
