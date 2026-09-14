/**
 * x402 payment verification for body-priced routes.
 *
 * Speaks the V2 wire format (PAYMENT-REQUIRED / PAYMENT-SIGNATURE /
 * PAYMENT-RESPONSE, CAIP-2 networks) while settling through our own on-chain
 * verifier. `X-Payment` is still accepted for existing integrations.
 */

import type { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import { NETWORKS, usdc, createResourceServer, createPrepaidGate, multiGate, attachReceipt } from '@hfsp/x402-common';
import { assertPaymentStoreReady } from '../services/nullifier.js';
import { USDC_MINT, BASE_USDC, HELIUS_RPC, type SourceChain, config } from '../config.js';

const MAX_AGE_SECS   = 300;


// ── Solana verification ───────────────────────────────────────────────────────

async function verifySolana(
  signature: string,
  recipientWallet: string,
  minUsdc: number,
): Promise<{ ok: boolean; error?: string; paid: number }> {

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

  let received = 0n;
  for (const pb of post) {
    if (pb.mint !== USDC_MINT || pb.owner !== recipientWallet) continue;
    const before = pre.find(p => p.accountIndex === pb.accountIndex)?.uiTokenAmount as { amount: string } | undefined;
    const after = pb.uiTokenAmount as { amount: string };
    received += BigInt(after.amount) - BigInt(before?.amount ?? '0');
  }
  const paid = Number(received) / 1e6;
  if (received < BigInt(usdc(minUsdc))) return { ok: false, error: 'Payment is below the required amount', paid };
  return { ok: true, paid };
}

// ── Base EVM verification ─────────────────────────────────────────────────────

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function verifyBase(
  txHash: string,
  recipientWallet: string,
  minUsdc: number,
): Promise<{ ok: boolean; error?: string; paid: number }> {

  const provider = new ethers.JsonRpcProvider(config.BASE_RPC_URL);

  const [receipt, block] = await Promise.all([
    provider.getTransactionReceipt(txHash),
    provider.getTransaction(txHash).then(tx => tx ? provider.getBlock(tx.blockNumber!) : null),
  ]);

  if (!receipt) return { ok: false, error: 'Transaction not found on Base', paid: 0 };
  if (receipt.status !== 1) return { ok: false, error: 'Transaction reverted', paid: 0 };

  if (!block) return { ok: false, error: 'Payment block not found', paid: 0 };
  if (block) {
    const ageSecs = Date.now() / 1000 - block.timestamp;
    if (ageSecs > MAX_AGE_SECS) return { ok: false, error: `Payment expired (${Math.round(ageSecs)}s)`, paid: 0 };
  }

  // Find USDC Transfer log to our wallet
  const recipientPadded = recipientWallet.toLowerCase().replace('0x', '0x000000000000000000000000');
  let received = 0n;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== BASE_USDC.toLowerCase()) continue;
    if (log.topics[0] !== ERC20_TRANSFER_TOPIC) continue;
    if (log.topics[2]?.toLowerCase() !== recipientPadded) continue;
    received += BigInt(log.data);
  }
  const paid = Number(received) / 1e6;
  if (received < BigInt(usdc(minUsdc))) return { ok: false, error: 'Payment is below the required amount', paid };
  return { ok: true, paid };
}

// V2 authorizations settle before any principal is bridged. X-Payment remains
// an explicit legacy broadcast-transaction flow.
const settle = createPrepaidGate(createResourceServer({
  facilitatorUrl: config.FACILITATOR_URL,
  families: ['evm', 'svm'], networks: ['base', 'solana'],
}));

export function makeX402Gate(opts: {
  amountUsdc: number | ((req: Request) => number);
  description: string | ((req: Request) => string);
  resource?: string;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const amount = typeof opts.amountUsdc === 'function' ? opts.amountUsdc(req) : opts.amountUsdc;
      const description = typeof opts.description === 'function' ? opts.description(req) : opts.description;
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000) {
        res.status(400).json({ error: 'Invalid payment amount' }); return;
      }
      const v2 = req.get('payment-signature')?.trim();
      const legacy = !v2 ? req.get('x-payment')?.trim() : undefined;
      if (v2 || legacy) await assertPaymentStoreReady();
      if (!legacy) {
        const selected = req.body?.sourceChain as SourceChain | undefined;
        const networks: SourceChain[] = selected ? [selected] : ['solana', 'base'];
        const route = multiGate(description, networks.map(network => ({
          price: amount, network, description,
          payTo: network === 'base' ? config.EVM_WALLET_ADDRESS : config.WALLET_PUBLIC_KEY,
        })));
        const payment = await settle(req, res, opts.resource ? { ...route, resource: opts.resource } : route);
        if (!payment) return;
        const chain = payment.network === NETWORKS.base ? 'base' : 'solana';
        res.locals.payment = { paidUsdc: Number(payment.amount) / 1e6, signature: payment.transaction, chain };
      } else {
        const chain: SourceChain = legacy.startsWith('0x') ? 'base' : 'solana';
        if (req.body?.sourceChain && req.body.sourceChain !== chain) {
          res.status(400).json({ error: 'Payment chain must match sourceChain' }); return;
        }
        const result = chain === 'base'
          ? await verifyBase(legacy, config.EVM_WALLET_ADDRESS, amount)
          : await verifySolana(legacy, config.WALLET_PUBLIC_KEY, amount);
        if (!result.ok) { res.status(402).json({ error: result.error }); return; }
        res.locals.payment = { paidUsdc: result.paid, signature: legacy, chain };
        attachReceipt(res, { success: true, network: chain, transaction: legacy });
      }
      next();
    } catch (error) { next(error); }
  };
}
