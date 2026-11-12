// Internal fulfillment endpoint — not exposed to the public internet.
//
// Called by trusted sibling backends (e.g., gnosis-card-x402) after they have
// already verified a non-Solana payment (e.g., Gnosis Chain USDC transfer).
// Authentication is a shared secret in X-Internal-Key.
//
// POST /api/internal/fulfill
//   Headers: X-Internal-Key: <INTERNAL_KEY>
//   Body: { email, items }
//   Response: { ok: true, data: <cryptorefills fulfillment> }

import { Router } from "express";
import { z } from "zod";
import env from "../config.js";
import { crPhase1 } from "../services/cryptorefills.js";
import { payAndFulfill } from "../services/paysolana.js";

const router = Router();

const OrderItemSchema = z.object({
  product_id:           z.string().min(1),
  product_value:        z.number().positive().optional(),
  beneficiary_account:  z.string().optional(),
});

const BodySchema = z.object({
  email: z.string().email(),
  items: z.array(OrderItemSchema).min(1).max(10),
});

router.post("/fulfill", async (req, res) => {
  const key = req.headers["x-internal-key"];
  if (!env.INTERNAL_KEY || key !== env.INTERNAL_KEY) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const body = { ...parsed.data, network: "solana" as const };

  let crResult;
  try {
    crResult = await crPhase1(body);
  } catch (e: unknown) {
    res.status(502).json({ ok: false, error: `Cryptorefills unavailable: ${(e as Error).message}` });
    return;
  }

  try {
    const result = await payAndFulfill(body, crResult.sessionId, crResult.paymentRequired);
    res.json({ ok: true, data: result });
  } catch (e: unknown) {
    console.error("[store/internal] fulfillment failed", { error: (e as Error).message, email: body.email });
    res.status(502).json({
      ok:    false,
      error: "Order fulfillment failed. Contact info@hfsp.xyz for a refund.",
      code:  "FULFILLMENT_FAILED",
    });
  }
});

export default router;
