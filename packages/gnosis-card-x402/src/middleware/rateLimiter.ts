import rateLimit from 'express-rate-limit';

// 10 claim attempts per 15 min per IP — generous enough for legitimate users
export const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — try again in 15 minutes' },
  // Do NOT log the IP that hit the limit
  keyGenerator: (req) => {
    // Hash the IP so we don't retain it in memory in plain text
    const ip = req.ip ?? 'unknown';
    let hash = 0;
    for (let i = 0; i < ip.length; i++) hash = (hash * 31 + ip.charCodeAt(i)) | 0;
    return String(hash);
  },
});

// 60 payment checks per 5 min — for the x402 gate
export const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded' },
  keyGenerator: (req) => {
    const ip = req.ip ?? 'unknown';
    let hash = 0;
    for (let i = 0; i < ip.length; i++) hash = (hash * 31 + ip.charCodeAt(i)) | 0;
    return String(hash);
  },
});
