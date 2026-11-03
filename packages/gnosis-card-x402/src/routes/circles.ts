// Circles Mini App fulfillment — Gnosis Safe → Cryptorefills gift card via x402.
//
// Flow:
//   1. POST /api/circles/quote
//      Calls x402-store phase 1 to get the USDC price, creates a pending order,
//      and returns Gnosis Chain payment details (token address + amount) so the
//      mini app can build the Safe transaction.
//
//   2. POST /api/circles/fulfill
//      Called after the user's Safe transaction is broadcast. Verifies the Gnosis
//      Chain ERC-20 transfer, then calls x402-store /api/internal/fulfill, which
//      pays Cryptorefills from its Solana wallet and returns the gift card.
//
//   3. GET /api/circles/status/:orderId
//      Poll for order status / result.

import { Router } from 'express';
import { ethers } from 'ethers';
import { z } from 'zod';
import { config, GNOSIS_TOKENS, GNOSIS_CHAIN_ID } from '../config.js';

export const circlesRouter = Router();

const STORE = config.STORE_API_URL.replace(/\/$/, '');

// ── Pending order store (in-memory, 15-min TTL) ───────────────────────────

type OrderStatus = 'pending' | 'verifying' | 'fulfilled' | 'failed';

interface PendingOrder {
  orderId:      string;
  email:        string;
  items:        unknown[];
  amountUnits:  bigint;   // USDC 6-decimal units
  amountUsd:    string;   // human-readable
  createdAt:    number;
  status:       OrderStatus;
  result?:      unknown;
  error?:       string;
}

const orders = new Map<string, PendingOrder>();

setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, o] of orders) {
    if (o.createdAt < cutoff && o.status !== 'fulfilled') orders.delete(id);
  }
}, 5 * 60 * 1000);

// ── Helpers ───────────────────────────────────────────────────────────────

function genOrderId() {
  return `circ_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function storePhase1(body: unknown): Promise<{ amountUnits: bigint; amountUsd: string }> {
  const res = await fetch(`${STORE}/api/orders`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (res.status !== 402) {
    const t = await res.text();
    throw new Error(`x402-store phase 1 unexpected status ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { pay?: { amount?: number; amountUsd?: string } };
  const amountRaw  = data?.pay?.amount;
  const amountUsd  = data?.pay?.amountUsd ?? String((Number(amountRaw ?? 0) / 1_000_000).toFixed(6));
  if (!amountRaw) throw new Error('x402-store phase 1 returned no amount');
  return { amountUnits: BigInt(Math.ceil(Number(amountRaw))), amountUsd };
}

async function storeInternalFulfill(email: string, items: unknown[]): Promise<unknown> {
  if (!config.STORE_INTERNAL_KEY) throw new Error('STORE_INTERNAL_KEY not configured');
  const res = await fetch(`${STORE}/api/internal/fulfill`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'X-Internal-Key': config.STORE_INTERNAL_KEY,
    },
    body: JSON.stringify({ email, items }),
  });
  const json = (await res.json()) as { ok: boolean; data?: unknown; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error ?? `Store internal error ${res.status}`);
  return json.data;
}

// Verify a USDC ERC-20 transfer to our wallet on Gnosis Chain.
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

async function verifyGnosisTransfer(
  txHash: string,
  expectedRecipient: string,
  minUnits: bigint,
): Promise<void> {
  const provider = new ethers.JsonRpcProvider(config.GNOSIS_RPC_URL);
  const receipt  = await provider.waitForTransaction(txHash, 1, 60_000);
  if (!receipt || receipt.status !== 1) throw new Error('Transaction not confirmed or failed');

  const paddedTo = ethers.zeroPadValue(expectedRecipient.toLowerCase(), 32);
  const log = receipt.logs.find(l =>
    l.address.toLowerCase() === GNOSIS_TOKENS.USDC.toLowerCase() &&
    l.topics[0] === TRANSFER_TOPIC &&
    l.topics[2]?.toLowerCase() === paddedTo.toLowerCase(),
  );

  if (!log) throw new Error('No USDC transfer to our address found in this transaction');

  const transferred = BigInt(log.data);
  if (transferred < minUnits) {
    throw new Error(
      `Underpayment: expected ≥${minUnits} USDC units, got ${transferred}`,
    );
  }
}

// ── Route: POST /api/circles/quote ────────────────────────────────────────

const QuoteBody = z.object({
  email: z.string().email(),
  items: z.array(z.object({
    product_id:          z.string().min(1),
    product_value:       z.number().positive().optional(),
    beneficiary_account: z.string().optional(),
  })).min(1).max(10),
});

circlesRouter.post('/quote', async (req, res) => {
  const parsed = QuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }
  const { email, items } = parsed.data;

  let amountUnits: bigint;
  let amountUsd: string;
  try {
    ({ amountUnits, amountUsd } = await storePhase1({ email, items }));
  } catch (e: unknown) {
    res.status(502).json({ error: (e as Error).message });
    return;
  }

  const orderId = genOrderId();
  orders.set(orderId, { orderId, email, items, amountUnits, amountUsd, createdAt: Date.now(), status: 'pending' });

  res.json({
    orderId,
    payTo:        config.EVM_WALLET_ADDRESS,
    tokenAddress: GNOSIS_TOKENS.USDC,
    chainId:      GNOSIS_CHAIN_ID,
    amountUnits:  amountUnits.toString(),
    amountUsd,
    expiresAt:    Date.now() + 15 * 60 * 1000,
  });
});

// ── Route: POST /api/circles/fulfill ─────────────────────────────────────

const FulfillBody = z.object({
  orderId: z.string().min(1),
  txHash:  z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

circlesRouter.post('/fulfill', async (req, res) => {
  const parsed = FulfillBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'orderId and txHash (0x + 64 hex chars) required' });
    return;
  }
  const { orderId, txHash } = parsed.data;

  const order = orders.get(orderId);
  if (!order)                         return void res.status(404).json({ error: 'Order not found or expired' });
  if (order.status === 'fulfilled')   return void res.json({ ok: true, data: order.result });
  if (order.status === 'verifying')   return void res.status(409).json({ error: 'Fulfillment already in progress' });
  if (order.status === 'failed')      return void res.status(400).json({ error: order.error ?? 'Order failed' });

  order.status = 'verifying';

  // Verify Gnosis Chain payment, then fulfill — respond 202 immediately so
  // the client can start polling while we wait for chain confirmation.
  res.status(202).json({ orderId, status: 'verifying' });

  try {
    await verifyGnosisTransfer(txHash, config.EVM_WALLET_ADDRESS, order.amountUnits);
    const result = await storeInternalFulfill(order.email, order.items);
    order.status = 'fulfilled';
    order.result = result;
  } catch (e: unknown) {
    order.status = 'failed';
    order.error  = (e as Error).message;
    console.error('[circles] fulfillment failed', { orderId, error: order.error });
  }
});

// ── Route: GET /api/circles/status/:orderId ───────────────────────────────

circlesRouter.get('/status/:orderId', (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) {
    res.status(404).json({ error: 'Order not found or expired' });
    return;
  }
  res.json({
    orderId: order.orderId,
    status:  order.status,
    ...(order.result ? { data: order.result } : {}),
    ...(order.error  ? { error: order.error }  : {}),
  });
});
