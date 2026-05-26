import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import { clearCredentialMap, sanitizeSpawnRequestLogs } from './logSanitizer.js';
import { getCredentials, type VaultEntry } from '../vault/vaultService.js';
import { db } from '../db/index.js';

const router = Router();
const textEncoder = new TextEncoder();

type AuthenticatedSpawnRequest = Request & {
  userPubkey: string;
  vaultEntry: VaultEntry;
};

const SpawnBodySchema = z.object({
  agentId: z.string().min(1).max(128),
}).strict();

class VaultCredentialDerivationUnavailableError extends Error {
  constructor() {
    super('Server-side credential derivation is unavailable for zero-knowledge vault entries');
    this.name = 'VaultCredentialDerivationUnavailableError';
  }
}

router.post('/spawn', authenticateSpawnSignature, sanitizeSpawnRequestLogs, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedSpawnRequest;
  const { vaultEntry } = authReq;

  if (hasCredentialBody(req.body)) {
    clearRequestCredentials(req);
    return res.status(400).json({
      success: false,
      error: 'Credentials must not be provided in request body. Spawn authorization is bound to the stored vault entry.',
    });
  }

  const parse = SpawnBodySchema.safeParse(req.body);
  if (!parse.success) {
    clearRequestCredentials(req);
    return res.status(400).json({ success: false, error: 'Invalid request', details: parse.error.format() });
  }

  if (parse.data.agentId.trim() !== vaultEntry.agentId) {
    clearRequestCredentials(req);
    return res.status(400).json({ success: false, error: 'Agent id does not match vault entry' });
  }

  try {
    deriveCredentialsFromVaultEntry(vaultEntry);
  } catch (error) {
    if (error instanceof VaultCredentialDerivationUnavailableError) {
      return res.status(501).json({
        success: false,
        error: 'Cannot derive plaintext credentials from the encrypted vault entry on the backend without breaking the zero-knowledge model.',
      });
    }

    console.error('[agent/spawn] failed', {
      agentId: vaultEntry.agentId,
      userPubkey: vaultEntry.userPubkey,
      error: error instanceof Error ? error.message : 'Agent spawn failed',
    });
    return res.status(500).json({ success: false, error: 'Agent spawn failed' });
  }
});

function authenticateSpawnSignature(req: Request, res: Response, next: NextFunction): void {
  const agentId = extractAgentId(req.body);
  if (!agentId) {
    clearRequestCredentials(req);
    res.status(400).json({ success: false, error: 'agentId is required' });
    return;
  }

  const signature = getBearerToken(req.headers.authorization);
  const userPubkey = getHeader(req, 'x-wallet-pubkey') ?? getHeader(req, 'x-wallet-address');

  if (!signature || !userPubkey) {
    clearRequestCredentials(req);
    res.status(401).json({ success: false, error: 'Missing wallet signature authorization' });
    return;
  }

  const normalizedUserPubkey = userPubkey.trim();
  const vaultEntry = getCredentials(agentId, normalizedUserPubkey);
  if (!vaultEntry) {
    clearRequestCredentials(req);
    res.status(404).json({ success: false, error: 'Credential vault entry not found' });
    return;
  }

  const message = buildSpawnAuthMessage(vaultEntry);
  if (!verifyWalletSignature(vaultEntry.userPubkey, signature, message)) {
    clearRequestCredentials(req);
    res.status(401).json({ success: false, error: 'Invalid wallet signature authorization' });
    return;
  }

  if (agentOwnershipConflicts(vaultEntry.agentId, vaultEntry.userPubkey)) {
    clearRequestCredentials(req);
    res.status(403).json({ success: false, error: 'Authenticated wallet does not own this agent' });
    return;
  }

  (req as AuthenticatedSpawnRequest).userPubkey = vaultEntry.userPubkey;
  (req as AuthenticatedSpawnRequest).vaultEntry = vaultEntry;
  next();
}

export function buildSpawnAuthMessage(vaultEntry: Pick<VaultEntry, 'id' | 'agentId' | 'userPubkey' | 'updatedAt'>): string {
  return [
    'Clawdrop agent spawn authentication - v1',
    `Vault: ${vaultEntry.id}`,
    `Agent: ${vaultEntry.agentId}`,
    `Wallet: ${vaultEntry.userPubkey}`,
    `Updated: ${vaultEntry.updatedAt}`,
  ].join('\n');
}

function deriveCredentialsFromVaultEntry(_vaultEntry: VaultEntry): never {
  throw new VaultCredentialDerivationUnavailableError();
}

function verifyWalletSignature(userPubkey: string, signature: string, message: string): boolean {
  const signatureBytes = decodeSignature(signature);
  if (!signatureBytes) return false;

  try {
    const publicKey = new PublicKey(userPubkey);
    return ed25519.verify(signatureBytes, textEncoder.encode(message), publicKey.toBytes());
  } catch {
    return false;
  }
}

function decodeSignature(signature: string): Uint8Array | null {
  const normalized = signature.trim();
  if (/^[0-9a-fA-F]{128}$/.test(normalized)) {
    return Uint8Array.from(Buffer.from(normalized, 'hex'));
  }

  try {
    const decoded = Uint8Array.from(Buffer.from(normalized, 'base64'));
    return decoded.byteLength === 64 ? decoded : null;
  } catch {
    return null;
  }
}

function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  return token || null;
}

function getHeader(req: Request, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' ? value : null;
}

function extractAgentId(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }

  const agentId = (body as { agentId?: unknown }).agentId;
  return typeof agentId === 'string' && agentId.trim() ? agentId.trim() : null;
}

function hasCredentialBody(body: unknown): boolean {
  return !!body && typeof body === 'object' && !Array.isArray(body) && 'credentials' in body;
}

function clearRequestCredentials(req: Request): void {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return;
  }

  const body = req.body as { credentials?: Record<string, string> };
  if (body.credentials && typeof body.credentials === 'object' && !Array.isArray(body.credentials)) {
    clearCredentialMap(body.credentials);
  }
}

function agentOwnershipConflicts(agentId: string, userPubkey: string): boolean {
  const row = db().prepare(`
    SELECT u.wallet_address
    FROM agents a
    JOIN users u ON u.id = a.user_id
    WHERE a.id = ?
    LIMIT 1
  `).get(agentId) as { wallet_address: string | null } | undefined;

  return !!row?.wallet_address && row.wallet_address !== userPubkey;
}

export default router;
