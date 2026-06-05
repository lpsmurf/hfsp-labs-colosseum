/**
 * x402 payment verification middleware for Solana USDC.
 *
 * makeX402Gate(opts) — factory for fixed-price products (card top-up, onboarding)
 *
 * Without X-Payment header → 402 with payment details.
 * With X-Payment: <solana-tx-sig> → verifies on-chain via Helius → calls next().
 *
 * Attaches res.locals.payment = { paidUsdc, signature } for downstream handlers.
 */

import type { Request, Response, NextFunction } from 'express';
import { USDC_MINT, HELIUS_RPC, config } from '../config.js';

const MAX_AGE_SECS = 300;
const usedSignatures = new Set<string>();

async function verifyOnChain(
  signature: string,
  recipientWallet: string,
  minUsdc: number,
): Promise<{ ok: boolean; error?: string; paid: number }> {
  if (usedSignatures.has(signature)) {
    return { ok: false, error: 'Signature already used', paid: 0 };
  }

  const res = await fetch(HELIUS_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'getTransaction',
      params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
    }),
  });
  const { result: tx } = await res.json() as { result: Record<string, unknown> | null };
  if (!tx) return { ok: false, error: 'Transaction not found', paid: 0 };

  const meta = tx.meta as Record<string, unknown>;
  if (meta?.err) return { ok: false, error: 'Transaction failed on-chain', paid: 0 };

  const ageSecs = Date.now() / 1000 - (tx.blockTime as number ?? 0);
  if (ageSecs > MAX_AGE_SECS) {
    return { ok: false, error: `Payment expired (${Math.round(ageSecs)}s > ${MAX_AGE_SECS}s)`, paid: 0 };
  }

  const post = meta?.postTokenBalances as Array<Record<string, unknown>> ?? [];
  const pre  = meta?.preTokenBalances  as Array<Record<string, unknown>> ?? [];

  let paid = 0;
  for (const pb of post) {
    if (pb.mint !== USDC_MINT || pb.owner !== recipientWallet) continue;
    const preBal  = (pre.find(p => p.accountIndex === pb.accountIndex)?.uiTokenAmount as Record<string, unknown>)?.uiAmount as number ?? 0;
    const postBal = (pb.uiTokenAmount as Record<string, unknown>)?.uiAmount as number ?? 0;
    paid += postBal - preBal;
  }

  if (paid < minUsdc * 0.95) {
    return { ok: false, error: `Underpaid: $${paid.toFixed(4)} USDC received, $${minUsdc} required`, paid };
  }

  usedSignatures.add(signature);
  setTimeout(() => usedSignatures.delete(signature), 900_000);
  return { ok: true, paid };
}

/**
 * Generic x402 gate factory for fixed-price products.
 *
 * Usage:
 *   router.post('/topup', makeX402Gate({
 *     amountUsdc: 10,
 *     description: 'Gnosis Pay Safe top-up — 10 USDC',
 *     resource: '/api/card/topup',
 *   }), handler)
 *
 * Sets res.locals.payment = { paidUsdc, signature }.
 */
export function makeX402Gate(opts: {
  amountUsdc: number | ((req: Request) => number);
  description: string | ((req: Request) => string);
  resource?: string;
}) {
  return function x402GenericGate(req: Request, res: Response, next: NextFunction) {
    const amount = typeof opts.amountUsdc === 'function' ? opts.amountUsdc(req) : opts.amountUsdc;
    const description = typeof opts.description === 'function' ? opts.description(req) : opts.description;
    const usdcMicro = Math.round(amount * 1_000_000).toString();
    const paymentSig = (req.headers['x-payment'] as string | undefined)?.trim();

    if (!paymentSig) {
      res.status(402).json({
        x402Version: 1,
        error:       'Payment required',
        description,
        accepts: [{
          scheme:            'exact',
          network:           'solana-mainnet',
          maxAmountRequired: usdcMicro,
          asset:             USDC_MINT,
          payTo:             config.WALLET_PUBLIC_KEY,
          resource:          opts.resource ?? `${req.protocol}://${req.get('host')}${req.path}`,
          description,
          mimeType:          'application/json',
          maxTimeoutSeconds: 300,
        }],
      });
      return;
    }

    verifyOnChain(paymentSig, config.WALLET_PUBLIC_KEY, amount)
      .then(({ ok, error, paid }) => {
        if (!ok) { res.status(402).json({ error }); return; }
        res.locals.payment = { paidUsdc: paid, signature: paymentSig };
        next();
      })
      .catch((err: unknown) => {
        res.status(500).json({ error: `Payment verification error: ${err instanceof Error ? err.message : String(err)}` });
      });
  };
}
