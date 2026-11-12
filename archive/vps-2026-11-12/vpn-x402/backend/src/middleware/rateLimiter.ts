// Rate limiting strategy:
// - claimLimiter (provisioning routes): keys by verified sender wallet from solanaPayment middleware.
//   Falls back to a global bucket for unauthenticated requests (those hit the 402 before claiming).
// - payLimiter (probe/test routes): same wallet-keyed approach.
//
// This prevents one wallet from hammering provisioning while preserving privacy
// (no IP addresses are stored or logged).
import rateLimit from "express-rate-limit";
import type { Request } from "express";

function walletKey(req: Request): string {
  // solanaPayment middleware attaches this after payment is verified
  const wallet = (req as any).solanaPayment?.from;
  return wallet ?? "unauthenticated";
}

export const payLimiter = rateLimit({
  windowMs:       60 * 1000,
  max:            10,
  standardHeaders: true,
  legacyHeaders:  false,
  keyGenerator:   walletKey,
  message: { ok: false, error: "Too many requests", code: "RATE_LIMITED" },
});

export const claimLimiter = rateLimit({
  windowMs:       60 * 1000,
  max:            5, // max 5 provisions per wallet per minute
  standardHeaders: true,
  legacyHeaders:  false,
  keyGenerator:   walletKey,
  message: { ok: false, error: "Too many requests", code: "RATE_LIMITED" },
});
