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
import { claimTxSig, releaseTxSig } from "../services/redis.js";
import { TxAlreadyUsed } from "../errors.js";

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
router.post("/", async (req, res) => {
  const txSig  = req.headers["x-solana-tx"] as string | undefined;
  const url    = `https://store.hfsp.cloud${req.originalUrl.split("?")[0]}`;

  // ── Phase 1: no payment header → return 402 ──────────────────────────────
  // x402 gate runs before body validation so probes always see a 402.
  if (!txSig) {
    const parsed = OrderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      // Body missing or invalid — return 402 with a $1 placeholder so discovery
      // probes (which send no body) receive a valid x402 challenge.
      const placeholder = BigInt(1_000_000);
      const { headers, body: resBody } = make402(placeholder, placeholder, url);
      res.set(headers).status(402).json(resBody);
      return;
    }

    const body = parsed.data;
    let crResult;
    try {
      crResult = await crPhase1({ ...body, network: "solana" });
    } catch (e: any) {
      res.status(502).json({ ok: false, error: `Failed to get price from Cryptorefills: ${e.message}` });
      return;
    }

    const ourAmount = applyCommission(crResult.crAmount);
    const { headers, body: resBody } = make402(ourAmount, crResult.crAmount, url);
    res.set(headers).status(402).json(resBody);
    return;
  }

  // ── Phase 2: payment header present → validate body, verify, fulfill ─────
  const parsed = OrderBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;

  const claimed = await claimTxSig(txSig);
  if (!claimed) {
    const err = new TxAlreadyUsed(txSig);
    res.status(err.httpStatus).json(err.toResponse());
    return;
  }

  // Get a fresh CR Phase 1 to know the exact price we need to verify
  let crResult;
  try {
    crResult = await crPhase1({ ...body, network: "solana" });
  } catch (e: any) {
    await releaseTxSig(txSig);
    res.status(502).json({ ok: false, error: `Cryptorefills unavailable: ${e.message}` });
    return;
  }

  const crAmount  = crResult.crAmount;
  const ourAmount = applyCommission(crAmount);

  const verification = await verifyHeliusTx(txSig, USDC_MINT, OPERATOR, ourAmount);
  if (!verification.ok) {
    await releaseTxSig(txSig);
    res.status(402).json({
      ok:   false,
      error: verification.error,
      hint: `Required: $${(Number(ourAmount) / 1_000_000).toFixed(4)} USDC`,
      txSig,
    });
    return;
  }

  // Payment verified — now pay Cryptorefills and get the gift card
  try {
    const result = await payAndFulfill(
      { ...body, network: "solana" },
      crResult.sessionId,
      crResult.paymentRequired,
    );
    res.json({ ok: true, data: result });
  } catch (e: any) {
    // Payment verified but CR fulfillment failed. DO NOT release txSig (payment already consumed).
    // Log the order body so we can manually refund if needed.
    console.error("[store] fulfillment failed after payment verified", {
      txSig: txSig.slice(0, 16),
      error: e.message,
      email: body.email,
    });
    res.status(502).json({
      ok:    false,
      error: "Order fulfillment failed after payment. Contact info@hfsp.xyz with your transaction signature for a refund.",
      txSig,
      code:  "FULFILLMENT_FAILED",
    });
  }
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
