/**
 * A real x402 seller, gated by @hfsp/x402-sdk. Stands up two priced routes and a
 * /.well-known/x402 discovery manifest. Used by the demo to prove the full
 * discover → pay → consume loop locally.
 *
 * NOTE: payment verification hits Solana RPC. For an offline, deterministic demo
 * the runner uses DEMO_MODE to stub verification; in real use, drop DEMO_MODE and
 * point rpcUrl at Helius. The 402 challenge + manifest are produced by the real SDK.
 */
import express from "express";
import { x402 } from "@hfsp/x402-sdk/server";

const PAYTO = process.env.PAYTO ?? "GdAWRcvrVabFi6QtciGJNYsS8cykJkZTNZ3cFea6ywfY";
const RPC   = process.env.HELIUS_RPC_URL ?? "https://api.devnet.solana.com";

export function createSeller() {
  const app = express();
  app.use(express.json());

  const gate = (resourceId, amount) =>
    x402({
      amount, payTo: PAYTO, rpcUrl: RPC, resourceId,
      description: `Paid route ${resourceId}`,
      bazaar: {
        method: "POST",
        output: { example: { score: 0.91 }, schema: { type: "object", properties: { score: { type: "number" } } } },
      },
    });

  app.post("/score", gate("/score", 5_000n), (_req, res) => res.json({ score: 0.91 }));
  app.post("/premium", gate("/premium", 50_000n), (_req, res) => res.json({ score: 0.91, rationale: "…" }));

  // Discovery manifest — what an agent crawls before probing.
  app.get("/.well-known/x402", (req, res) => {
    const base = `${req.protocol}://${req.get("host")}`;
    res.json({
      x402Version: 2,
      seller: { name: "Local Demo Seller", contact: "info@hfsp.xyz" },
      networks: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
      resources: [
        { url: `${base}/score`,   description: "Toxicity score", accepts: [{ scheme: "exact", network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", amount: "5000",  asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", payTo: PAYTO, extra: { method: "POST", memo: "/score" } }] },
        { url: `${base}/premium`, description: "Score + rationale", accepts: [{ scheme: "exact", network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", amount: "50000", asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", payTo: PAYTO, extra: { method: "POST", memo: "/premium" } }] },
      ],
    });
  });

  return app;
}
