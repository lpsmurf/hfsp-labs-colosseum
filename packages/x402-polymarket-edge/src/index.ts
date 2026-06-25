import "dotenv/config";
import express, { type RequestHandler } from "express";
import helmet from "helmet";
import cors from "cors";
import { x402, type BazaarConfig } from "@hfsp/x402-sdk";
import { config } from "./config.js";
import { runPipeline } from "./engine/pipeline.js";

const app = express();
app.use(helmet());
app.use(cors());
app.set("trust proxy", 1);

const priceUsd = Number(config.pricePerCall) / 1e6;

// ── x402 gate (Bazaar-discoverable) ───────────────────────────────────────────
const edgesBazaar: BazaarConfig = {
  method: "GET",
  queryParams:       { minEdge: 0.03, limit: 20 },
  queryParamsSchema: { properties: {
    minEdge: { type: "number", description: "Minimum net edge (default 0.03 = 3%)" },
    limit:   { type: "integer", description: "Max signals to return (default 20)" },
  } },
  output: {
    example: [{ question: "Team A vs Team B", outcomeLabel: "Team A", entryPrice: 0.52, pFair: 0.61, netEdge: 0.07, kellyStakeUsd: 35 }],
    schema: { type: "array", items: { type: "object", properties: {
      marketId:      { type: "string" },
      question:      { type: "string" },
      url:           { type: "string" },
      outcomeLabel:  { type: "string" },
      entryPrice:    { type: "number" },
      pFair:         { type: "number" },
      netEdge:       { type: "number" },
      kellyStakeUsd: { type: "number" },
    } } },
  },
};

const gate = x402({
  amount:      config.pricePerCall,
  payTo:       config.payTo,
  rpcUrl:      config.heliusRpc,
  description: `Polymarket edge signals — $${priceUsd} USDC per query on Solana`,
  bazaar:      edgesBazaar,
}) as unknown as RequestHandler;

// ── Free endpoints ────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true, service: "x402-polymarket-edge", pricePerCall: `$${priceUsd}` }));

app.get("/", (_req, res) => res.json({
  service:     "x402-polymarket-edge",
  description: "Non-custodial Polymarket edge signals — bet the gap between Polymarket price and sharp no-vig fair value (oddspapi/Pinnacle). Pay per query with x402.",
  price:       `${Number(config.pricePerCall)} micro-USDC ($${priceUsd})`,
  payTo:       config.payTo,
  endpoints:   { edges: "GET /edges (x402-gated)", health: "GET /health" },
  disclaimer:  "Research signals, not financial advice. Non-custodial — you place and fund your own bets. Prediction markets carry total-loss risk.",
}));

// ── Gated endpoint ────────────────────────────────────────────────────────────
// GET /edges?minEdge=0.03&limit=20  → ranked edge signals
app.get("/edges", gate, async (req, res) => {
  const minEdge = req.query["minEdge"] !== undefined ? Number(req.query["minEdge"]) : config.universe.minEdge;
  const limit   = req.query["limit"]   !== undefined ? Math.max(1, Math.min(100, Number(req.query["limit"]) || 20)) : 20;

  try {
    const result = await runPipeline();
    const signals = result.signals.filter((s) => s.netEdge >= (Number.isFinite(minEdge) ? minEdge : config.universe.minEdge)).slice(0, limit);
    res.json({
      meta: {
        scannedMarkets: result.scannedMarkets,
        fixtures:       result.fixtures,
        matched:        result.matched,
        returned:       signals.length,
        oddsConfigured: result.oddsConfigured,
        generatedAt:    result.generatedAt,
        note:           result.oddsConfigured ? undefined : "ODDS_API_KEY not set — no sharp fair value, so no edges (fail-closed).",
      },
      disclaimer: "Research signals only. Non-custodial: place/fund bets with your own wallet. Validate with CLV before going live.",
      signals,
    });
  } catch (err) {
    console.error("[edges] pipeline error:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "edge pipeline failed" });
  }
});

app.use((_req, res) => res.status(404).json({ error: "not found" }));

app.listen(Number(config.port), () => {
  console.log(`[x402-polymarket-edge] :${config.port}  $${priceUsd}/query → ${config.payTo.slice(0, 8)}…`);
});
