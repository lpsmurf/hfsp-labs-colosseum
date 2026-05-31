import type { NextFunction, Request, Response } from 'express';

export const CREDENTIAL_FIELD_PATTERN = /(^DISCORD_|^TELEGRAM_|_TOKEN$|_KEY$|_SECRET$)/i;
export const REDACTED_VALUE = '[REDACTED]';

export type SanitizedRequest = Request & {
  sanitizedBody?: unknown;
};

export function sanitizeSpawnRequestLogs(req: Request, res: Response, next: NextFunction): void {
  const sanitizedBody = sanitizeForLogs(req.body);
  (req as SanitizedRequest).sanitizedBody = sanitizedBody;
  res.locals.sanitizedBody = sanitizedBody;
  next();
}

// AUDIT: CRITICAL — This sanitizer only covers Express request bodies. Docker container
// stdout/stderr is NOT sanitized here. The dockerService.ts mitigates this by setting
// LogConfig: { Type: 'none' }, but if logging is ever re-enabled, credential leakage
// to Docker logs is possible. Consider adding a log driver that pipes through a
// credential-stripping filter or ensuring LogConfig.type stays 'none' permanently.

export function sanitizeForLogs(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogs(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.entries(value).reduce<Record<string, unknown>>((sanitized, [key, entryValue]) => {
    sanitized[key] = CREDENTIAL_FIELD_PATTERN.test(key) ? REDACTED_VALUE : sanitizeForLogs(entryValue);
    return sanitized;
  }, {});
}

export function clearCredentialMap(credentials: Record<string, string>): void {
  for (const key of Object.keys(credentials)) {
    credentials[key] = '';
    delete credentials[key];
  }
}
