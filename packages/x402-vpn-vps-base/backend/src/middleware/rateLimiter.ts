// Rate limiting for the Base x402 backend.
// Payment is the primary spam protection — you must pay real USDC per provisioning request.
// These limits guard the 402 response endpoint (free info) from harvest bots.
// No IP addresses are stored or logged (noLogs middleware scrubs them before this runs).
// We use a simple global bucket keyed by a hash of the X-PAYMENT header if present,
// otherwise falling back to a shared "anonymous" bucket.
import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { createHash } from "crypto";

function paymentKey(req: Request): string {
  // Use first 16 chars of the X-PAYMENT header as a bucket key (not PII).
  // This groups retries of the same payment together and separates distinct payers.
  const header = req.headers["x-payment"] as string | undefined;
  if (header) return header.slice(0, 16);

  // Fallback: derive a per-client anonymous key using request IP + user-agent
  // hashed client-side here; this avoids a single global "anonymous" bucket
  // while not storing or logging the raw IP/user-agent values.
  // Prefer X-Forwarded-For when behind a proxy (ensure `app.set('trust proxy', 1)` in production)
  const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  let ip = xff || (req as any).ip || req.socket.remoteAddress;
  // If we still don't have an address, include a port or rng suffix to reduce collisions
  if (!ip) ip = `${req.socket.remoteAddress ?? 'unknown'}:${req.socket.remotePort ?? Math.floor(Math.random()*1e6)}`;
  const ua = req.headers['user-agent'] ?? '';
  const h = createHash('sha256').update(`${ip}|${ua}`).digest('hex');
  return `anon-${h.slice(0,16)}`;
}

// Generous limit — payment is the real gate
// IMPORTANT: The payment verification middleware (which populates `req.payment` or
// `req.solanaPayment`) should be registered BEFORE this limiter when possible so
// wallet-based buckets are used. If not possible, the fallback anon hash is used.
export const claimLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    paymentKey,
  message: { ok: false, error: "Too many requests", code: "RATE_LIMITED" },
});
