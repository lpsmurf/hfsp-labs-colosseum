/**
 * Authentication Routes
 * 
 * JWT-based wallet authentication for Phase 4
 * POST /api/v1/auth/wallet - Authenticate with wallet signature
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { PublicKey } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import { logger } from '../utils/logger';
import * as phase4Store from '../db/phase4-store';

const router = Router();

/**
 * Verify Solana wallet signature
 * Uses NaCl for Ed25519 signature verification
 */
function verifyWalletSignature(
  walletAddress: string,
  message: string,
  signature: string
): boolean {
  try {
    // Decode base58 wallet address to public key bytes
    const publicKey = new PublicKey(walletAddress).toBytes();
    
    // Decode base64 signature
    const signatureBytes = Buffer.from(signature, 'base64');
    
    // Message bytes
    const messageBytes = Buffer.from(message, 'utf8');
    
    // Verify signature
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
  } catch (error) {
    logger.warn({ error, walletAddress }, 'Signature verification failed');
    return false;
  }
}

/**
 * Generate JWT token
 */
function generateJWT(
  userId: string, 
  walletAddress: string,
  expiresInSeconds: number
): string {
  const privateKey = process.env.JWT_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error('JWT_PRIVATE_KEY not configured');
  }
  
  const token = jwt.sign(
    { 
      userId, 
      walletAddress,
      iat: Math.floor(Date.now() / 1000) 
    },
    Buffer.from(privateKey, 'base64').toString('ascii'),
    { 
      algorithm: 'RS256', 
      expiresIn: expiresInSeconds 
    }
  );
  
  return token;
}

/**
 * POST /api/v1/auth/wallet
 * Authenticate with wallet signature
 */
router.post('/wallet', async (req, res) => {
  try {
    const { 
      walletAddress, 
      walletProvider, 
      message, 
      signature,
      email 
    } = req.body;

    // Validate required fields
    if (!walletAddress || !walletProvider || !message || !signature) {
      logger.warn('Missing required fields in auth request');
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'Missing required fields: walletAddress, walletProvider, message, signature'
      });
    }

    // Validate wallet address format (Solana base58)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(walletAddress)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid wallet address format'
      });
    }

    // Verify signature
    const isValid = verifyWalletSignature(walletAddress, message, signature);
    if (!isValid) {
      logger.warn({ walletAddress }, 'Invalid signature');
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid signature' 
      });
    }

    // Find or create user
    let user = phase4Store.getUserByWallet(walletAddress);
    
    if (!user) {
      // Create new user
      user = phase4Store.createUser({
        walletAddress,
        walletProvider: walletProvider as any,
        email,
      });
      logger.info({ userId: user.id, wallet: walletAddress }, 'New user created');
    } else {
      logger.info({ userId: user.id, wallet: walletAddress }, 'User authenticated');
    }

    // Generate JWT
    const expiresIn = parseInt(process.env.JWT_EXPIRY || '3600', 10);
    const jwtToken = generateJWT(user.id, walletAddress, expiresIn);

    res.json({
      success: true,
      userId: user.id,
      jwt: jwtToken,
      expiresIn,
      wallet: {
        address: user.walletAddress,
        provider: user.walletProvider,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Auth endpoint error');
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Authentication failed' 
    });
  }
});

/**
 * GET /api/v1/auth/verify
 * Verify JWT token validity (for frontend checks)
 */
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ valid: false, error: 'No token provided' });
    }

    const token = authHeader.slice(7);
    const publicKey = process.env.JWT_PUBLIC_KEY;
    
    if (!publicKey) {
      return res.status(500).json({ valid: false, error: 'Server configuration error' });
    }

    const decoded = jwt.verify(
      token, 
      Buffer.from(publicKey, 'base64').toString('ascii'),
      { algorithms: ['RS256'] }
    ) as { userId: string; walletAddress: string; exp: number };

    res.json({
      valid: true,
      userId: decoded.userId,
      walletAddress: decoded.walletAddress,
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
    });
  } catch (error) {
    res.status(401).json({ valid: false, error: 'Invalid or expired token' });
  }
});

export default router;
