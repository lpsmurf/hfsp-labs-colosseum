import type { Request, Response, NextFunction } from "express";

const PII_PATTERNS = [
  /\b[0-9a-fA-F]{64}\b/g,
  /\b0x[0-9a-fA-F]{40}\b/g,
  /\bip=[\d.]+/g,
];

const CRYPTO_PATTERNS = [
  /(?:solana_address|solanaAddress|sender|recipient|wallet|from|to)["':\s]*[:=]?\s*["']?[1-9A-HJ-NP-Za-km-z]{32,44}["']?/gi,
];

function redact(value: string): string {
  let out = value;
  for (const pattern of PII_PATTERNS) out = out.replace(pattern, "[REDACTED]");
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
    return Object.entries(obj).reduce((acc, [k, v]) => { acc[k] = deepRedact(v); return acc; }, {} as Record<string, unknown>);
  }
  return obj;
}

export function noLogs(req: Request, _res: Response, next: NextFunction) {
  delete (req as any).realIp;
  const sensitiveHeaders = ["authorization", "cookie", "x-real-ip", "x-forwarded-for"];
  for (const h of sensitiveHeaders) { if (h in req.headers) req.headers[h] = "[REDACTED]"; }

  const ipDescriptor = Object.getOwnPropertyDescriptor(req, "ip");
  if (!ipDescriptor || ipDescriptor.configurable) {
    Object.defineProperty(req, "ip", { get: () => "[REDACTED]", configurable: false, enumerable: false });
  }

  if (req.body && typeof req.body === "object") {
    req.body = deepRedact(req.body) as any;
  }
  console.log(`${req.method} ${redact(req.url)}`);
  next();
}
