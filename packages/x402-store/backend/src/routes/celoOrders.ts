// x402-gated orders paid on Celo, fulfilled by Cryptorefills on Base.
//
//   POST /api/celo/orders?asset=USDT|USDC|USAT
//
//   1st request  → price the order, lock the price, answer 402 (Celo, chosen asset)
//   paid retry   → settle via the Celo facilitator into the operator wallet (x402
//                  `upfront` flow), then bridge Celo → Base unless a float covers
//                  it, pay Cryptorefills on Base, return the top-up / gift card.
//
// Money that arrives but cannot be fulfilled is recorded for reconciliation and
// never retried automatically: a second attempt could buy the product twice.
import { Router } from "express";
import { z } from "zod";
import { createResourceServer, createPrepaidGate, gate, FACILITATORS } from "@hfsp/x402-common";
import { celoEnv } from "../celoConfig.js";
import { operatorAddress } from "../services/evm.js";
import { claimTxSig, redis } from "../services/redis.js";
import { orderKey, getLock, setLock, dropLock, facilitatorCredits } from "../services/celoState.js";
import { priceOrder, fulfilPaidOrder, AssetUnavailable } from "../services/celoFulfil.js";
import { OrderRejected, rejectionMessage } from "../services/cryptorefills.js";

const router = Router();

const settle = createPrepaidGate(createResourceServer({
  facilitatorUrl: FACILITATORS.celo,
  facilitatorApiKey: celoEnv.CELO_FACILITATOR_API_KEY,
  families: ["evm"],
  networks: ["celo"],
}));

export const OrderBodySchema = z.object({
  email: z.string().email(),
  items: z.array(z.object({
    product_id: z.string().min(1),
    product_value: z.number().positive().optional(),
    beneficiary_account: z.string().optional()
      // Validate phone numbers before quoting (E.164): the supplier rejects
      // anything else, but only after a price has been locked.
      .refine(v => v === undefined || !/^[\d\s()-]+$/.test(v), "Phone numbers need international format: + and country code, e.g. +2348031234567")
      .refine(v => v === undefined || !v.startsWith("+") || /^\+[1-9]\d{6,14}$/.test(v), "Phone number must be + followed by 7–15 digits, e.g. +2348031234567"),
  })).length(1), // one item per order keeps pricing, bridging and refunds unambiguous
});

// USAT is swapped to USDT on Celo before bridging (no direct USAT → Base route).
export const AssetSchema = z.enum(["USDT", "USDC", "USAT"]);

router.post("/", async (req, res, next) => {
  try {
    const parsed = OrderBodySchema.safeParse(req.body);
    const asset = AssetSchema.safeParse(req.query.asset ?? "USDT");
    if (!parsed.success || !asset.success) {
      res.status(400).json({ ok: false, error: "Invalid order", details: parsed.success ? asset.error?.flatten() : parsed.error.flatten() });
      return;
    }
    const body = parsed.data;

    if ((await facilitatorCredits()) < celoEnv.MIN_FACILITATOR_CREDITS) {
      res.status(503).json({ ok: false, code: "SETTLEMENT_UNAVAILABLE", error: "Celo payments are paused. Try again shortly." });
      return;
    }

    // Refuse to take a payment if the replay guard cannot be written.
    await redis.ping();

    const key = orderKey(body, asset.data);
    let lock = await getLock(key);
    if (!lock) {
      // A payment arriving after its quote expired is re-priced, not rejected with
      // a custom status: if the amount no longer matches, the facilitator's
      // value-mismatch answer becomes a standard 402 carrying the fresh price,
      // which is what any spec-following x402 client knows how to retry.
      try {
        lock = await priceOrder(body, asset.data);
      } catch (error) {
        if (error instanceof AssetUnavailable) {
          res.status(422).json({ ok: false, code: "ASSET_UNAVAILABLE", error: `Paying in ${asset.data} is not available for this order right now. Try asset=USDT.` });
          return;
        }
        if (error instanceof OrderRejected) {
          res.status(422).json({ ok: false, code: error.reason, error: rejectionMessage(error) });
          return;
        }
        throw error;
      }
      await setLock(key, lock);
    }

    const paid = await settle(req, res, {
      ...gate({
        price: Number(lock.priceAtomic) / 1e6,
        payTo: operatorAddress(),
        network: "celo",
        asset: lock.asset,
        description: "Mobile airtime, data, gift card or eSIM — fulfilled via Cryptorefills",
        maxTimeoutSeconds: 300,
      }),
      // Optional ResourceInfo fields (x402 V2 §5.1.2), used for discovery filtering.
      serviceName: "Celo Agent Commerce",
      tags: ["airtime", "mobile-data", "gift-cards", "esim", "celo"],
    });
    if (!paid) return; // 402 challenge or payment error already sent

    if (!await claimTxSig(paid.transaction)) {
      res.status(409).json({ ok: false, code: "TX_ALREADY_USED", error: "This payment was already used for an order." });
      return;
    }
    await dropLock(key);

    try {
      const { result, bridge } = await fulfilPaidOrder(body, lock, {
        rail: "x402", tx: paid.transaction, payer: paid.payer, integrator: req.get("x-integrator")?.slice(0, 80),
      });
      res.json({ ok: true, data: result, payment: { transaction: paid.transaction, network: paid.network }, bridge });
    } catch {
      res.status(502).json({
        ok: false, code: "FULFILLMENT_FAILED", transaction: paid.transaction,
        error: "Payment received; fulfilment needs reconciliation. Contact info@hfsp.xyz with your transaction hash.",
      });
    }
  } catch (error) { next(error); }
});

export default router;
