// x402-gated orders paid on Celo, fulfilled by Cryptorefills on Base.
//
//   POST /api/celo/orders?asset=USDT|USDC|USAT
//
//   1st request  → price the order, lock the price, answer 402 (Celo, chosen asset)
//   paid retry   → settle via the Celo facilitator into the operator wallet (x402
//                  `upfront` flow) and answer 202 with an order id at once; the
//                  swap/bridge, Cryptorefills purchase and delivery run in the
//                  background.
//
//   GET /api/celo/orders/:orderId → fulfilling | delivering | delivered | failed
//
// Money that arrives but cannot be fulfilled is recorded for reconciliation and
// never retried automatically: a second attempt could buy the product twice.
import { Router } from "express";
import { OrderBodySchema, AssetSchema } from "./celoSchemas.js";
import { createResourceServer, createPrepaidGate, gate, FACILITATORS } from "@hfsp/x402-common";
import { celoEnv } from "../celoConfig.js";
import { operatorAddress } from "../services/evm.js";
import { claimTxSig, redis } from "../services/redis.js";
import { orderKey, getLock, setLock, dropLock, facilitatorCredits } from "../services/celoState.js";
import { randomBytes } from "node:crypto";
import { priceOrder, AssetUnavailable } from "../services/celoFulfil.js";
import { startFulfilment, getProgress, publicResult } from "../services/celoJobs.js";
import { quoteLimit, statusLimit } from "../middleware/celoRateLimit.js";
import { integratorSummary } from "../services/celoLedger.js";
import { OrderRejected, rejectionMessage } from "../services/cryptorefills.js";

const router = Router();

const settle = createPrepaidGate(createResourceServer({
  facilitatorUrl: FACILITATORS.celo,
  facilitatorApiKey: celoEnv.CELO_FACILITATOR_API_KEY,
  families: ["evm"],
  networks: ["celo"],
}));

export { OrderBodySchema, AssetSchema } from "./celoSchemas.js";

router.post("/", quoteLimit, async (req, res, next) => {
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

    // Paid: answer now, fulfil in the background. The payment is final either way.
    const orderId = randomBytes(8).toString("hex");
    const progress = await startFulfilment(orderId, body, lock, {
      rail: "x402", tx: paid.transaction, payer: paid.payer, integrator: req.get("x-integrator")?.slice(0, 80),
    });
    res.status(202).json({
      ok: true,
      orderId,
      status: progress.stage,
      statusUrl: `/api/celo/orders/${orderId}`,
      message: "Payment received. Delivery usually takes 1–15 minutes; poll statusUrl.",
      payment: { transaction: paid.transaction, network: paid.network },
    });
  } catch (error) { next(error); }
});

router.get("/:orderId", statusLimit, async (req, res, next) => {
  try {
    const progress = /^[0-9a-f]{16}$/.test(req.params.orderId) ? await getProgress(req.params.orderId) : null;
    if (!progress) { res.status(404).json({ ok: false, error: "Order not found" }); return; }
    res.json({
      ok: progress.stage !== "failed",
      orderId: req.params.orderId,
      status: progress.stage,
      data: publicResult(progress.result),
      error: progress.error,
      updatedAt: new Date(progress.updatedAt).toISOString(),
    });
  } catch (error) { next(error); }
});

// Integrator revenue share (read-only). An integrator polls its own accrued
// share by the id it sends as X-Integrator (its ERC-8004 agent id).
router.get("/integrators/:id", statusLimit, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!/^[A-Za-z0-9:_.\-]{1,80}$/.test(id)) { res.status(400).json({ ok: false, error: "Invalid integrator id" }); return; }
    const summary = await integratorSummary(id);
    res.json({ ok: true, ...summary });
  } catch (error) { next(error); }
});

export default router;
