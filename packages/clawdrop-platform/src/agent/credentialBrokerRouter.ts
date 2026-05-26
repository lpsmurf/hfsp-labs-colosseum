import { Router, type Request, type Response } from 'express';
import { redeemCredentialLease } from './credentialBroker.js';

const router = Router();

router.post('/:agentId/redeem', (req: Request, res: Response) => {
  const token = getBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: 'Missing credential lease token' });
  }

  const credentials = redeemCredentialLease(req.params.agentId, token);
  if (!credentials) {
    return res.status(404).json({ error: 'Credential lease not found or expired' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.json({ credentials });
});

function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  return token || null;
}

export default router;
