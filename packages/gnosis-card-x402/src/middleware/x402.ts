/**
 * x402 payment verification middleware.
 * Supports Solana USDC (via Helius) and Base USDC (via Base RPC).
 *
 * X-Payment header carries a tx signature/hash.
 * X-Payment-Chain header: "solana" (default) | "base"
 */

import type { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import { USDC_MINT, BASE_USDC, HELIUS_RPC, type SourceChain, config } from '../config.js';

const MAX_AGE_SECS   = 300;
const usedSignatures = new Set<string>();

// ── Solana verification ───────────────────────────────────────────────────────

async function verifySolana(
  signature: string,
  recipientWallet: string,
  minUsdc: number,
): Promise<{ ok: boolean; error?: string; paid: number }> {
  if (usedSignatures.has(signature)) return { ok: false, error: 'Signature already used', paid: 0 };

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
  if (ageSecs > MAX_AGE_SECS) return { ok: false, error: `Payment expired (${Math.round(ageSecs)}s)`, paid: 0 };

  const post = meta?.postTokenBalances as Array<Record<string, unknown>> ?? [];
  const pre  = meta?.preTokenBalances  as Array<Record<string, unknown>> ?? [];

  let paid = 0;
  for (const pb of post) {
    if (pb.mint !== USDC_MINT || pb.owner !== recipientWallet) continue;
    const preBal  = (pre.find(p => p.accountIndex === pb.accountIndex)?.uiTokenAmount as Record<string, unknown>)?.uiAmount as number ?? 0;
    const postBal = (pb.uiTokenAmount as Record<string, unknown>)?.uiAmount as number ?? 0;
    paid += postBal - preBal;
  }

  if (paid < minUsdc * 0.95) return { ok: false, error: `Underpaid: $${paid.toFixed(4)} received, $${minUsdc} required`, paid };

  usedSignatures.add(signature);
  setTimeout(() => usedSignatures.delete(signature), 900_000);
  return { ok: true, paid };
}

// ── Base EVM verification ─────────────────────────────────────────────────────

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function verifyBase(
  txHash: string,
  recipientWallet: string,
  minUsdc: number,
): Promise<{ ok: boolean; error?: string; paid: number }> {
  if (usedSignatures.has(txHash)) return { ok: false, error: 'Transaction already used', paid: 0 };

  const provider = new ethers.JsonRpcProvider(config.BASE_RPC_URL);

  const [receipt, block] = await Promise.all([
    provider.getTransactionReceipt(txHash),
    provider.getTransaction(txHash).then(tx => tx ? provider.getBlock(tx.blockNumber!) : null),
  ]);

  if (!receipt) return { ok: false, error: 'Transaction not found on Base', paid: 0 };
  if (receipt.status !== 1) return { ok: false, error: 'Transaction reverted', paid: 0 };

  if (block) {
    const ageSecs = Date.now() / 1000 - block.timestamp;
    if (ageSecs > MAX_AGE_SECS) return { ok: false, error: `Payment expired (${Math.round(ageSecs)}s)`, paid: 0 };
  }

  // Find USDC Transfer log to our wallet
  const recipientPadded = recipientWallet.toLowerCase().replace('0x', '0x000000000000000000000000');
  let paid = 0;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== BASE_USDC.toLowerCase()) continue;
    if (log.topics[0] !== ERC20_TRANSFER_TOPIC) continue;
    if (!log.topics[2]?.toLowerCase().endsWith(recipientWallet.slice(2).toLowerCase())) continue;
    paid += Number(BigInt(log.data)) / 1e6;
  }

  void recipientPadded; // suppress unused warning

  if (paid < minUsdc * 0.95) return { ok: false, error: `Underpaid: $${paid.toFixed(4)} received, $${minUsdc} required`, paid };

  usedSignatures.add(txHash);
  setTimeout(() => usedSignatures.delete(txHash), 900_000);
  return { ok: true, paid };
}

// ── Gate factory ──────────────────────────────────────────────────────────────

export function makeX402Gate(opts: {
  amountUsdc:   number | ((req: Request) => number);
  description:  string | ((req: Request) => string);
  resource?:    string;
}) {
  return function x402Gate(req: Request, res: Response, next: NextFunction) {
    const amount      = typeof opts.amountUsdc  === 'function' ? opts.amountUsdc(req)  : opts.amountUsdc;
    const description = typeof opts.description === 'function' ? opts.description(req) : opts.description;
    const usdcMicro   = Math.round(amount * 1_000_000).toString();
    const paymentSig  = (req.headers['x-payment']       as string | undefined)?.trim();
    const chain       = ((req.headers['x-payment-chain'] as string | undefined)?.trim() ?? 'solana') as SourceChain;
    const resource    = opts.resource ?? `${req.protocol}://${req.get('host')}${req.path}`;

    if (!paymentSig) {
      res.status(402).json({
        x402Version: 1,
        error:       'Payment required',
        description,
        accepts: [
          {
            scheme:            'exact',
            network:           'solana-mainnet',
            maxAmountRequired: usdcMicro,
            asset:             USDC_MINT,
            payTo:             config.WALLET_PUBLIC_KEY,
            resource,
            description,
            mimeType:          'application/json',
            maxTimeoutSeconds: 300,
          },
          {
            scheme:            'exact',
            network:           'base-mainnet',
            maxAmountRequired: usdcMicro,
            asset:             BASE_USDC,
            payTo:             config.EVM_WALLET_ADDRESS,
            resource,
            description,
            mimeType:          'application/json',
            maxTimeoutSeconds: 300,
          },
        ],
      });
      return;
    }

    const verify = chain === 'base'
      ? verifyBase(paymentSig, config.EVM_WALLET_ADDRESS, amount)
      : verifySolana(paymentSig, config.WALLET_PUBLIC_KEY, amount);

    verify
      .then(({ ok, error, paid }) => {
        if (!ok) { res.status(402).json({ error }); return; }
        res.locals.payment = { paidUsdc: paid, signature: paymentSig, chain };
        next();
      })
      .catch((err: unknown) => {
        res.status(500).json({ error: `Payment verification error: ${err instanceof Error ? err.message : String(err)}` });
      });
  };
}
