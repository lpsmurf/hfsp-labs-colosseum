import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { Keypair } from '@solana/web3.js';
import { logAuditEvent } from '../db/migrations.js';
import type { AceService, AgentId, PaymentResult } from '../types.js';

// x402 payments are made transparently by the AceDataCloud SDK when it receives
// a 402 Payment Required response. This module provides the keypair loader and
// records payment events for audit / bounty proof purposes.

export function buildSignerFromPrivateKey(privateKey: string): Keypair {
  const normalized = privateKey.trim();
  if (!normalized || normalized.includes('your_')) {
    throw new Error('WALLET_PRIVATE_KEY is required for x402 settlement');
  }

  if (normalized.startsWith('[')) {
    const parsed = JSON.parse(normalized) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }

  if (normalized.includes(',')) {
    return Keypair.fromSecretKey(
      Uint8Array.from(normalized.split(',').map((p) => Number.parseInt(p.trim(), 10))),
    );
  }

  // Base64 detection: contains +, /, or = characters (not valid base58)
  if (normalized.includes('+') || normalized.includes('/') || normalized.endsWith('=')) {
    return Keypair.fromSecretKey(Buffer.from(normalized, 'base64'));
  }

  return Keypair.fromSecretKey(decodeBase58(normalized));
}

// Called by base.ts after each SDK call to record that x402 payment occurred.
// The SDK already settled the on-chain USDC payment; we log for the bounty audit trail.
// AUDIT: HIGH — recordX402Payment records the payment hash but does not verify
// on-chain finality (e.g., confirmation status, slot depth, or fork safety). If the
// SDK submits a transaction that is later dropped or reverted, the audit trail will
// show a false confirmed status. Fix: poll the Solana RPC for the transaction status
// and only mark confirmed after reaching a safe confirmation threshold (e.g., 32 slots).
export function recordX402Payment(
  agentId: AgentId,
  service: AceService,
  x402TxHash: string | null,
  db?: Database,
): PaymentResult {
  const id = randomUUID();
  const status = x402TxHash ? 'confirmed' : 'pending';

  if (x402TxHash) {
    db?.prepare(`
      INSERT INTO payments (id, agent_id, service, tokens_used, sol_amount, tx_signature, status, created_at, confirmed_at)
      VALUES (?, ?, ?, 0, 0, ?, 'confirmed', datetime('now'), datetime('now'))
    `).run(id, agentId, service, x402TxHash);
  } else {
    db?.prepare(`
      INSERT INTO payments (id, agent_id, service, tokens_used, sol_amount, tx_signature, status, created_at, confirmed_at)
      VALUES (?, ?, ?, 0, 0, NULL, 'pending', datetime('now'), NULL)
    `).run(id, agentId, service);
  }

  if (db) {
    logAuditEvent(db, agentId, 'x402_payment_recorded', {
      service,
      x402TxHash: x402TxHash ?? 'pending-usdc',
      protocol: 'x402/solana/usdc',
    });
  }

  return { id, txSignature: x402TxHash, confirmed: !!x402TxHash, solAmount: 0, status };
}

export function extractX402Hash(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const r = response as Record<string, unknown>;
  return (r.x402_tx ?? r.x402TxHash ?? r._x402_tx ?? null) as string | null;
}

function decodeBase58(value: string): Uint8Array {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const base = alphabet.length;
  const bytes = [0];

  for (const char of value) {
    const carry = alphabet.indexOf(char);
    if (carry < 0) throw new Error('WALLET_PRIVATE_KEY must be base58, JSON array, or comma array');
    let remainder = carry;
    for (let i = 0; i < bytes.length; i += 1) {
      const current = bytes[i] * base + remainder;
      bytes[i] = current & 0xff;
      remainder = current >> 8;
    }
    while (remainder > 0) {
      bytes.push(remainder & 0xff);
      remainder >>= 8;
    }
  }

  for (const char of value) {
    if (char !== '1') break;
    bytes.push(0);
  }

  return Uint8Array.from(bytes.reverse());
}
