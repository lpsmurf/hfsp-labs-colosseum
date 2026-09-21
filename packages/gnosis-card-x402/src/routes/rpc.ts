/**
 * /api/rpc/solana — server-side Solana RPC proxy.
 *
 * Lets the browser use a `Connection` without ever seeing the Helius API key.
 * The frontend points `new Connection('<origin>/api/rpc/solana')` here; web3.js
 * POSTs JSON-RPC bodies which we forward to Helius.
 *
 * Only a whitelist of read methods (plus broadcast/simulate) is allowed, so the
 * proxy can't be abused as a general-purpose relay that burns RPC credits.
 */

import { Router } from 'express';
import { HELIUS_RPC } from '../config.js';

export const rpcRouter = Router();

const ALLOWED_METHODS = new Set([
  // blockhash + confirmation (what Connection needs for a transfer)
  'getLatestBlockhash',
  'getSignatureStatuses',
  'getBlockHeight',
  'getEpochInfo',
  'getSlot',
  // balances / account reads (used by the UI)
  'getBalance',
  'getAccountInfo',
  'getTokenAccountBalance',
  'getTokenAccountsByOwner',
  'getMultipleAccounts',
  'getFeeForMessage',
  // broadcast / simulate (Phantom usually broadcasts itself, but allow as a fallback)
  'sendTransaction',
  'simulateTransaction',
]);

function isAllowed(body: unknown): boolean {
  const calls = Array.isArray(body) ? body : [body];
  return calls.every((c) => {
    const method = (c as { method?: unknown })?.method;
    return typeof method === 'string' && ALLOWED_METHODS.has(method);
  });
}

rpcRouter.post('/solana', async (req, res) => {
  if (!isAllowed(req.body)) {
    res.status(403).json({ error: 'RPC method not allowed' });
    return;
  }

  try {
    const upstream = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err: unknown) {
    res.status(502).json({ error: `RPC proxy failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});
