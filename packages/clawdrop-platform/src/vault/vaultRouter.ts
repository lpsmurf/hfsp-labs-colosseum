import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import {
  deleteCredentials,
  getCredentials,
  logAuditEvent,
  storeCredentials,
  type VaultEntry,
} from './vaultService.js';
import { stopContainerForAgent } from '../agent/dockerService.js';
import { db } from '../db/index.js';

const router = Router();
const textEncoder = new TextEncoder();

type AuthenticatedVaultRequest = Request & {
  userPubkey: string;
};

const StoreBodySchema = z.object({
  agentId: z.string().min(1).max(128),
  encryptedBlob: z.string().min(1),
  nonce: z.string().min(1),
  salt: z.string().min(1),
});

router.use(authenticateVaultSignature);

router.post('/store', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedVaultRequest;
  const parse = StoreBodySchema.safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({ error: 'Invalid request', details: parse.error.format() });
  }

  let encryptedBlob: Uint8Array;
  let nonce: Uint8Array;
  let salt: Uint8Array;

  try {
    encryptedBlob = decodeBinaryField(parse.data.encryptedBlob, 'encryptedBlob');
    nonce = decodeBinaryField(parse.data.nonce, 'nonce');
    salt = decodeBinaryField(parse.data.salt, 'salt');
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid binary field' });
  }

  try {
    const id = storeCredentials({
      userPubkey: authReq.userPubkey,
      agentId: parse.data.agentId,
      encryptedBlob,
      nonce,
      salt,
    });

    logAuditEvent({
      userPubkey: authReq.userPubkey,
      agentId: parse.data.agentId,
      action: 'store',
      ipAddress: req.ip,
      timestamp: Date.now(),
    });

    return res.status(201).json({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to store credentials';
    const status = message.includes('different wallet')
      ? 403
      : message.includes('must be') || message.includes('required')
        ? 400
        : 500;
    return res.status(status).json({ error: message });
  }
});

router.get('/:agentId', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedVaultRequest;

  try {
    const entry = getCredentials(req.params.agentId, authReq.userPubkey);
    if (!entry) {
      return res.status(404).json({ error: 'Credential vault entry not found' });
    }

    return res.json({ entry: serializeVaultEntry(entry) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read credentials';
    return res.status(500).json({ error: message });
  }
});

router.delete('/:agentId', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedVaultRequest;
  const startedAt = Date.now();
  const { agentId } = req.params;

  try {
    const entry = getCredentials(agentId, authReq.userPubkey);
    if (!entry) {
      return res.status(404).json({ deleted: false });
    }

    const containerId = findAgentContainerId(agentId, authReq.userPubkey);
    const container = await stopContainerForAgent(agentId, containerId);
    const deleted = deleteCredentials(agentId, authReq.userPubkey);
    if (!deleted) {
      return res.status(404).json({ deleted: false });
    }

    markAgentStopped(agentId, authReq.userPubkey);

    logAuditEvent({
      userPubkey: authReq.userPubkey,
      agentId,
      action: 'revoke',
      ipAddress: req.ip,
      timestamp: Date.now(),
    });

    return res.json({
      deleted: true,
      container,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[vault/revoke] failed', {
      agentId,
      userPubkey: authReq.userPubkey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return res.status(500).json({ error: 'Unable to revoke credentials' });
  }
});

function authenticateVaultSignature(req: Request, res: Response, next: NextFunction): void {
  const signature = getBearerToken(req.headers.authorization);
  const userPubkey = getHeader(req, 'x-wallet-pubkey') ?? getHeader(req, 'x-wallet-address');

  if (!signature || !userPubkey) {
    res.status(401).json({ error: 'Missing wallet signature authorization' });
    return;
  }

  const normalizedUserPubkey = userPubkey.trim();
  const message = buildVaultAuthMessage(normalizedUserPubkey);

  if (!verifyWalletSignature(normalizedUserPubkey, signature, message)) {
    res.status(401).json({ error: 'Invalid wallet signature authorization' });
    return;
  }

  (req as AuthenticatedVaultRequest).userPubkey = normalizedUserPubkey;
  next();
}

export function buildVaultAuthMessage(userPubkey: string): string {
  // AUDIT: CRITICAL — No nonce or timestamp in auth message. Same signature is replayable
  // indefinitely across all requests. Fix: add a server-generated nonce to the message
  // and require the client to sign `nonce + pubkey + timestamp`. The nonce must be
  // single-use and stored server-side (e.g., in Redis or a nonce table) until expiry.
  return `Clawdrop vault API authentication - v1: ${userPubkey.trim()}`;
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

function decodeBinaryField(value: string, field: string): Uint8Array {
  const normalized = value.trim();
  const withoutPrefix = normalized.startsWith('0x') ? normalized.slice(2) : normalized;

  if (/^[0-9a-fA-F]+$/.test(withoutPrefix) && withoutPrefix.length % 2 === 0) {
    const decoded = Buffer.from(withoutPrefix, 'hex');
    if (decoded.byteLength > 0) return decoded;
  }

  const decoded = Buffer.from(normalized, 'base64');
  if (decoded.byteLength === 0) {
    throw new Error(`${field} must be valid base64 or hex`);
  }

  return decoded;
}

function serializeVaultEntry(entry: VaultEntry): Record<string, unknown> {
  return {
    id: entry.id,
    userPubkey: entry.userPubkey,
    agentId: entry.agentId,
    encryptedBlob: Buffer.from(entry.encryptedBlob).toString('base64'),
    nonce: Buffer.from(entry.nonce).toString('base64'),
    salt: Buffer.from(entry.salt).toString('base64'),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
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

function findAgentContainerId(agentId: string, userPubkey: string): string | null {
  const row = db().prepare(`
    SELECT a.container_id
    FROM agents a
    JOIN users u ON u.id = a.user_id
    WHERE a.id = ? AND u.wallet_address = ?
    LIMIT 1
  `).get(agentId, userPubkey) as { container_id: string | null } | undefined;

  return row?.container_id ?? null;
}

function markAgentStopped(agentId: string, userPubkey: string): void {
  db().prepare(`
    UPDATE agents
    SET status = 'stopped'
    WHERE id = ?
      AND user_id IN (
        SELECT id FROM users WHERE wallet_address = ?
      )
  `).run(agentId, userPubkey);
}

export default router;
