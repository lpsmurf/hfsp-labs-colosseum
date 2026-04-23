/**
 * JWT Authentication Middleware
 * 
 * Verifies JWT tokens from Authorization header
 * Attaches userId to request for downstream use
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  walletAddress?: string;
}

/**
 * Verify JWT token from Authorization header
 */
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      logger.warn('Missing or invalid authorization header');
      res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header. Use: Bearer <token>'
      });
      return;
    }

    const token = authHeader.slice(7);
    const publicKey = process.env.JWT_PUBLIC_KEY;
    
    if (!publicKey) {
      logger.error('JWT_PUBLIC_KEY not configured');
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    // Verify token
    const decoded = jwt.verify(
      token, 
      Buffer.from(publicKey, 'base64').toString('ascii'), 
      { algorithms: ['RS256'] }
    ) as { 
      userId: string; 
      walletAddress?: string;
      iat: number;
      exp: number;
    };

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      logger.warn({ userId: decoded.userId }, 'Token expired');
      res.status(401).json({ error: 'Unauthorized', message: 'Token expired' });
      return;
    }

    // Attach user info to request
    req.userId = decoded.userId;
    req.walletAddress = decoded.walletAddress;
    
    logger.debug({ userId: decoded.userId }, 'JWT verified');
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid JWT token');
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
      return;
    }
    
    logger.error({ error }, 'Auth middleware error');
    res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Optional auth middleware - doesn't fail if no token
 * Useful for endpoints that work with or without auth
 */
export function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      // No token, continue anonymously
      return next();
    }

    const token = authHeader.slice(7);
    const publicKey = process.env.JWT_PUBLIC_KEY;
    
    if (!publicKey) {
      // Can't verify, continue anonymously
      return next();
    }

    const decoded = jwt.verify(
      token, 
      Buffer.from(publicKey, 'base64').toString('ascii'), 
      { algorithms: ['RS256'] }
    ) as { userId: string; walletAddress?: string };

    req.userId = decoded.userId;
    req.walletAddress = decoded.walletAddress;
    next();
  } catch (error) {
    // Invalid token, continue anonymously
    next();
  }
}

export default authMiddleware;
