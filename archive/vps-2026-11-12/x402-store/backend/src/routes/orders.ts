// x402-gated order endpoint.
//
// Flow:
//   Phase 1 (no X-Solana-Tx):
//     1. Forward body to Cryptorefills Phase 1 → get their exact price
//     2. Apply commission markup
//     3. Return 402 with our price
//
//   Phase 2 (with X-Solana-Tx header):
//     1. Replay protection (Redis SET NX)
//     2. Verify Helius tx: agent paid us ≥ our price
//     3. Call fresh Cryptorefills Phase 1 → get updated price + session
//     4. Pay Cryptorefills Phase 2 from our server wallet
//     5. Return gift card / top-up result to agent
//
import { Router } from "express";
import { z } from "zod";
import env from "../config.js";
import { crPhase1, getOrder } from "../services/cryptorefills.js";
import { payAndFulfill } from "../services/paysolana.js";
import { verifyHeliusTx } from "../services/heliusVerify.js";
import { claimTxSig, redis } from "../services/redis.js";
import { TxAlreadyUsed } from "../errors.js";

import { createResourceServer, createPrepaidGate, gate, DEFAULT_FACILITATOR } from '@hfsp/x402-common';
const settle = createPrepaidGate(createResourceServer({
  facilitatorUrl: process.env.FACILITATOR_URL ?? DEFAULT_FACILITATOR,
  families: ['svm'], networks: ['solana'],
}));
const router = Router();

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const OPERATOR  = env.OPERATOR_SOLANA_ADDRESS;
const NETWORK   = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";


const OrderItemSchema = z.object({
  product_id:           z.string().min(1),
  product_value:        z.number().positive().optional(),
  beneficiary_account:  z.string().optional(),
});

const OrderBodySchema = z.object({
  email:        z.string().email(),
  items:        z.array(OrderItemSchema).min(1).max(10),
  callback_url: z.string().url().optional(),
});

function applyCommission(crAmount: bigint): bigint {
  const withCommission = Number(crAmount) * (1 + env.COMMISSION_RATE);
  return BigInt(Math.ceil(withCommission));
}

function make402(ourAmount: bigint, crAmount: bigint, url: string) {
  const commissionUsd = ((Number(ourAmount) - Number(crAmount)) / 1_000_000).toFixed(6);
  const paymentRequired = {
    x402Version: 2,
    resource:    { url, description: "Cryptorefills gift card / top-up / eSIM via HFSP Store", mimeType: "application/json" },
    accepts: [{
      scheme:            "exact",
      network:           NETWORK,
      amount:            ourAmount.toString(),
      asset:             USDC_MINT,
      payTo:             OPERATOR,
      maxTimeoutSeconds: 300,
      extra:             {},
    }],
  };
  const encoded = Buffer.from(JSON.stringify(paymentRequired), "utf8").toString("base64");
  return {
    headers: { "PAYMENT-REQUIRED": encoded },
    body: {
      ...paymentRequired,
      ok:    false,
      error: "Payment Required",
      pay: {
        amount:        Number(ourAmount),
        amountUsd:     (Number(ourAmount) / 1_000_000).toFixed(6),
        mint:          USDC_MINT,
        payTo:         OPERATOR,
        network:       NETWORK,
        crAmount:      Number(crAmount),
        crAmountUsd:   (Number(crAmount) / 1_000_000).toFixed(6),
        commissionUsd,
        instructions:  "Send Solana mainnet USDC to payTo, then retry with X-Solana-Tx: <signature>",
      },
    },
  };
}

// POST /api/orders
router.post("/", async (req, res, next) => {
  try {
    const parsed = OrderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid order', details: parsed.error.flatten() }); return;
    }
    const body = parsed.data;
    const crResult = await crPhase1({ ...body, network: 'solana' });
    const ourAmount = applyCommission(crResult.crAmount);
    const v2 = req.get('payment-signature')?.trim();
    let txSig = !v2 ? req.get('x-solana-tx')?.trim() : undefined;
    if (!txSig) {
      // Do not accept a payment if the durable fulfillment guard is unavailable.
      if (v2) await redis.ping();
      const paid = await settle(req, res, gate({
        price: Number(ourAmount) / 1e6, payTo: OPERATOR, network: 'solana',
        description: 'Cryptorefills gift card / top-up / eSIM',
      }));
      if (!paid) return;
      txSig = paid.transaction;
    } else {
      const verified = await verifyHeliusTx(txSig, USDC_MINT, OPERATOR, ourAmount);
      if (!verified.ok) { res.status(402).json({ error: verified.error }); return; }
    }
    if (!await claimTxSig(txSig)) {
      const err = new TxAlreadyUsed(txSig);
      res.status(err.httpStatus).json(err.toResponse()); return;
    }
    try {
      const result = await payAndFulfill({ ...body, network: 'solana' }, crResult.sessionId, crResult.paymentRequired);
      res.json({ ok: true, data: result });
    } catch (fulfillError) {
      // An uncertain external purchase is never retried automatically.
      console.error("[store] fulfillment failed — needs reconciliation", { txSig, sessionId: crResult.sessionId }, fulfillError);
      res.status(502).json({ ok: false, code: 'FULFILLMENT_FAILED', txSig,
        error: 'Payment received; fulfillment needs reconciliation. Contact info@hfsp.xyz with your transaction signature.' });
    }
  } catch (error) { next(error); }
});

// GET /api/orders/:id — poll order status (free, no payment required)
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const data = await getOrder(id);
    res.json({ ok: true, data });
  } catch (e: any) {
    res.status(404).json({ ok: false, error: "Order not found", order_id: id });
  }
});

export default router;
