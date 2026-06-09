import type { Request, Response, NextFunction } from "express";

const PII_PATTERNS = [
  /\b[0-9a-fA-F]{64}\b/g,          // private keys / tx hashes
  /\b0x[0-9a-fA-F]{40}\b/g,        // EVM addresses
  /\bip=[\d.]+/g,                  // IP addresses in query strings
];

// Crypto address pattern: match Solana base58 addresses in known contexts only
// (field names, prefixes) to reduce false positives
const CRYPTO_PATTERNS = [
  /(?:solana_address|solanaAddress|sender|recipient|wallet|from|to)["':\s]*[:=]?\s*["']?[1-9A-HJ-NP-Za-km-z]{32,44}["']?/gi,
];

function redact(value: string): string {
  let out = value;
  for (const pattern of PII_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  for (const pattern of CRYPTO_PATTERNS) {
    out = out.replace(pattern, (match) => {
      const addr = match.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/)?.[0];
      return match.replace(addr || "", "[REDACTED]");
    });
  }
  return out;
}

function deepRedact(obj: unknown): unknown {
  if (typeof obj === "string") return redact(obj);
  if (typeof obj === "object" && obj !== null) {
    if (Array.isArray(obj)) return obj.map(deepRedact);
    return Object.entries(obj).reduce((acc, [k, v]) => {
      acc[k] = deepRedact(v);
      return acc;
    }, {} as Record<string, unknown>);
  }
  return obj;
}

export function noLogs(req: Request, _res: Response, next: NextFunction) {
  // Remove all IP surfaces and lock them read-only
  delete (req as any).realIp;
  delete (req as any).connection?.remoteAddress;
  delete (req as any).socket?.remoteAddress;
  
  // Redact sensitive headers.
  // Keep x-forwarded-proto intact so downstream protocol detection remains functional.
  const sensitiveHeaders = ["authorization", "cookie", "x-real-ip", "x-forwarded-for"];
  for (const header of sensitiveHeaders) {
    if (header in req.headers) {
      req.headers[header] = "[REDACTED]";
    }
  }
  
  // Define req.ip as non-configurable, non-writable getter only once
  const ipDescriptor = Object.getOwnPropertyDescriptor(req, "ip");
  if (!ipDescriptor || ipDescriptor.configurable) {
    if (!ipDescriptor || ipDescriptor.get?.() !== "[REDACTED]" || ipDescriptor.value !== "[REDACTED]") {
      Object.defineProperty(req, "ip", {
        get: () => "[REDACTED]",
        configurable: false,
        enumerable: false,
      });
    }
  }

  const safeBody = req.body && typeof req.body === "object" ? deepRedact(req.body) : req.body;
  const safeQuery = req.query && typeof req.query === "object" ? deepRedact(req.query) : req.query;
  void safeBody;
  void safeQuery;

  const safeUrl = redact(req.url);
  const safeMethod = req.method;
  // Minimal access log — method + redacted path only, no IP, no user agent
  console.log(`${safeMethod} ${safeUrl}`);

  next();
}
