import type { Request, Response, NextFunction } from "express";

const PII_PATTERNS = [
  /\b[0-9a-fA-F]{64}\b/g,             // private keys / tx hashes
  /\b0x[0-9a-fA-F]{40}\b/g,           // EVM addresses
  /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, // base58 keys
  /\bip=[\d.]+/g,                      // IP addresses in query strings
  /X-Forwarded-For[^,\r\n]*/gi,        // forwarded IP headers
];

function redact(value: string): string {
  let out = value;
  for (const pattern of PII_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

export function noLogs(req: Request, _res: Response, next: NextFunction) {
  (req as any).realIp = undefined;
  Object.defineProperty(req, "ip", { get: () => "[REDACTED]", configurable: true });

  const safeUrl = redact(req.url);
  console.log(`${req.method} ${safeUrl}`);

  next();
}
