/**
 * Rate Limiting Middleware
 * 
 * Provides rate limiting for API endpoints to prevent abuse.
 * Uses in-memory store (Redis recommended for production with multiple instances).
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  }
}, 60000); // Clean up every minute

export interface RateLimitOptions {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyGenerator?: (req: Request) => string;  // Custom key generator
  skipSuccessfulRequests?: boolean;  // Don't count 200s
  skipFailedRequests?: boolean;       // Don't count 4xx/5xx
  message?: string;      // Custom error message
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  windowMs: 60000,      // 1 minute
  maxRequests: 100,     // 100 requests per minute
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  message: 'Too many requests, please try again later.',
};

/**
 * Create rate limiting middleware
 */
export function rateLimit(options: Partial<RateLimitOptions> = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Generate key (default: IP + route)
      const key = config.keyGenerator 
        ? config.keyGenerator(req)
        : `${req.ip}:${req.route?.path || req.path}`;
      
      const now = Date.now();
      
      // Initialize or get existing record
      if (!store[key] || store[key].resetTime < now) {
        store[key] = {
          count: 0,
          resetTime: now + config.windowMs,
        };
      }
      
      // Increment count
      store[key].count++;
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, config.maxRequests - store[key].count));
      res.setHeader('X-RateLimit-Reset', store[key].resetTime);
      
      // Check if limit exceeded
      if (store[key].count > config.maxRequests) {
        logger.warn({
          ip: req.ip,
          path: req.path,
          key,
          count: store[key].count,
        }, 'Rate limit exceeded');
        
        return res.status(429).json({
          error: 'Too Many Requests',
          message: config.message,
          retry_after: Math.ceil((store[key].resetTime - now) / 1000),
        });
      }
      
      // Track response status for skip options
      res.on('finish', () => {
        const status = res.statusCode;
        
        if (config.skipSuccessfulRequests && status >= 200 && status < 300) {
          store[key].count--;
        }
        
        if (config.skipFailedRequests && status >= 400) {
          store[key].count--;
        }
      });
      
      next();
    } catch (error) {
      logger.error({ error }, 'Rate limiting error');
      // Fail open - don't block requests if rate limiter fails
      next();
    }
  };
}

/**
 * Pre-configured rate limiters for different use cases
 */

// Standard API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 60000,  // 1 minute
  maxRequests: 100, // 100 requests per minute
});

// Strict rate limiter for sensitive endpoints
export const strictLimiter = rateLimit({
  windowMs: 60000,  // 1 minute
  maxRequests: 10,  // 10 requests per minute
  message: 'Too many attempts. Please slow down.',
});

// Payment endpoint rate limiter
export const paymentLimiter = rateLimit({
  windowMs: 60000,  // 1 minute
  maxRequests: 5,   // 5 payment attempts per minute
  message: 'Too many payment attempts. Please wait before trying again.',
});

// Webhook rate limiter (higher limits for webhooks)
export const webhookLimiter = rateLimit({
  windowMs: 60000,  // 1 minute
  maxRequests: 1000, // 1000 webhooks per minute
  keyGenerator: (req) => {
    // Use API key or IP for webhooks
    return req.headers['x-api-key']?.toString() || req.ip || 'unknown';
  },
});

// Tier-based rate limiting (for authenticated users)
export function tierBasedLimiter(tier: 'free' | 'pro' | 'enterprise') {
  const limits = {
    free: { windowMs: 60000, maxRequests: 50 },
    pro: { windowMs: 60000, maxRequests: 500 },
    enterprise: { windowMs: 60000, maxRequests: 2000 },
  };
  
  const config = limits[tier] || limits.free;
  
  return rateLimit({
    ...config,
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise IP
      const userId = (req as any).user?.id || req.ip;
      return `${userId}:${req.path}`;
    },
  });
}

export default rateLimit;
