import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';

export type AuditAction = 'store' | 'spawn' | 'revoke' | 'update';

export interface VaultEntry {
  id: string;
  userPubkey: string;
  agentId: string;
  encryptedBlob: Uint8Array;
  nonce: Uint8Array;
  salt: Uint8Array;
  createdAt: number;
  updatedAt: number;
}

export interface AuditEntry {
  id: string;
  userPubkey: string;
  agentId: string;
  action: AuditAction;
  ipAddress?: string;
  timestamp: number;
}

type VaultRow = {
  id: string;
  user_pubkey: string;
  agent_id: string;
  encrypted_blob: Buffer;
  nonce: Buffer;
  salt: Buffer;
  created_at: number;
  updated_at: number;
};

export function storeCredentials(entry: Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'>): string {
  const userPubkey = normalizeRequired(entry.userPubkey, 'userPubkey');
  const agentId = normalizeRequired(entry.agentId, 'agentId');
  assertNonEmptyBytes(entry.encryptedBlob, 'encryptedBlob');
  assertBytes(entry.nonce, 12, 'nonce');
  assertBytes(entry.salt, 32, 'salt');

  const existing = db()
    .prepare('SELECT id, user_pubkey FROM credential_vault WHERE agent_id = ?')
    .get(agentId) as { id: string; user_pubkey: string } | undefined;

  const now = Date.now();
  if (existing) {
    if (existing.user_pubkey !== userPubkey) {
      throw new Error('Credential vault entry is owned by a different wallet');
    }

    db().prepare(`
      UPDATE credential_vault
      SET encrypted_blob = ?, nonce = ?, salt = ?, updated_at = ?
      WHERE id = ? AND user_pubkey = ?
    `).run(
      Buffer.from(entry.encryptedBlob),
      Buffer.from(entry.nonce),
      Buffer.from(entry.salt),
      now,
      existing.id,
      userPubkey,
    );

    return existing.id;
  }

  const id = uuidv4();
  db().prepare(`
    INSERT INTO credential_vault (
      id, user_pubkey, agent_id, encrypted_blob, nonce, salt, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userPubkey,
    agentId,
    Buffer.from(entry.encryptedBlob),
    Buffer.from(entry.nonce),
    Buffer.from(entry.salt),
    now,
    now,
  );

  return id;
}

export function getCredentials(agentId: string, userPubkey: string): VaultEntry | null {
  const normalizedAgentId = normalizeRequired(agentId, 'agentId');
  const normalizedUserPubkey = normalizeRequired(userPubkey, 'userPubkey');

  const row = db()
    .prepare(`
      SELECT id, user_pubkey, agent_id, encrypted_blob, nonce, salt, created_at, updated_at
      FROM credential_vault
      WHERE agent_id = ? AND user_pubkey = ?
      LIMIT 1
    `)
    .get(normalizedAgentId, normalizedUserPubkey) as VaultRow | undefined;

  return row ? mapVaultRow(row) : null;
}

export function deleteCredentials(agentId: string, userPubkey: string): boolean {
  const normalizedAgentId = normalizeRequired(agentId, 'agentId');
  const normalizedUserPubkey = normalizeRequired(userPubkey, 'userPubkey');

  const result = db()
    .prepare('DELETE FROM credential_vault WHERE agent_id = ? AND user_pubkey = ?')
    .run(normalizedAgentId, normalizedUserPubkey);

  return result.changes > 0;
}

export function logAuditEvent(entry: Omit<AuditEntry, 'id'>): void {
  const id = uuidv4();

  db().prepare(`
    INSERT INTO audit_log (id, user_pubkey, agent_id, action, ip_address, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    normalizeRequired(entry.userPubkey, 'userPubkey'),
    normalizeRequired(entry.agentId, 'agentId'),
    entry.action,
    entry.ipAddress ?? null,
    entry.timestamp,
  );
}

function mapVaultRow(row: VaultRow): VaultEntry {
  return {
    id: row.id,
    userPubkey: row.user_pubkey,
    agentId: row.agent_id,
    encryptedBlob: row.encrypted_blob,
    nonce: row.nonce,
    salt: row.salt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function assertNonEmptyBytes(value: Uint8Array, field: string): void {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new Error(`${field} must be non-empty bytes`);
  }
}

function assertBytes(value: Uint8Array, expectedBytes: number, field: string): void {
  if (!(value instanceof Uint8Array) || value.byteLength !== expectedBytes) {
    throw new Error(`${field} must be ${expectedBytes} bytes`);
  }
}

function normalizeRequired(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }

  return normalized;
}
