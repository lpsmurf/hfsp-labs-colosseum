import "dotenv/config";
import express, { type RequestHandler } from "express";
import helmet  from "helmet";
import cors    from "cors";
import { x402 } from "@hfsp/x402-sdk";
import { config } from "./config.js";

const app  = express();
const BASE = "https://api.backed.fi/api/v2/public";

app.use(helmet());
app.use(cors());
app.set("trust proxy", 1);

// ── Payment middleware ────────────────────────────────────────────────────────

const gate = x402({
  amount:      config.pricePerCall,
  payTo:       config.payTo,
  rpcUrl:      config.heliusRpc,
  description: "xStocks price feed — $0.001 USDC per call",
}) as unknown as RequestHandler;

// ── Backed proxy helper ───────────────────────────────────────────────────────

async function proxy(path: string, res: express.Response): Promise<void> {
  try {
    const r    = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
    const body = await r.json();
    res.status(r.status).json(body);
  } catch (err) {
    console.error("[feed] upstream error", err);
    res.status(502).json({ error: "upstream error" });
  }
}

// ── Free endpoints ────────────────────────────────────────────────────────────

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "x402-xstocks-feed", pricePerCall: `$${Number(config.pricePerCall) / 1e6}` })
);

app.get("/", (_req, res) => res.json({
  service:     "x402-xstocks-feed",
  description: "Pay-per-request xStocks price oracle. $0.001 USDC per call on Solana.",
  price:       `${Number(config.pricePerCall)} micro-USDC ($${Number(config.pricePerCall) / 1e6})`,
  payTo:       config.payTo,
  instructions: "Send payment, then retry with X-Solana-Tx: <signature>",
  endpoints: {
    assets:            "GET /assets",
    asset:             "GET /assets/:symbol",
    price:             "GET /assets/:symbol/price",
    multiplier:        "GET /assets/:symbol/multiplier",
    multiplierHistory: "GET /assets/:symbol/multiplier/history",
    supply:            "GET /assets/:symbol/supply",
    proofOfReserves:   "GET /reserves/:symbol",
    allReserves:       "GET /reserves",
    oracle:            "GET /oracles/:symbol",
    tradingStatus:     "GET /status/:symbol",
    dividends:         "GET /corporate-actions/history",
    upcoming:          "GET /corporate-actions/upcoming",
  },
}));

// ── Gated endpoints ($0.001 USDC each) ───────────────────────────────────────

// Asset list — common starting point for agents
app.get("/assets",                               gate, (_req, res) => proxy("/assets", res));
app.get("/assets/:symbol",                       gate, (req, res)  => proxy(`/assets/${req.params.symbol}`, res));

// Live price — the most valuable call for agents
app.get("/assets/:symbol/price",                 gate, (req, res)  => proxy(`/assets/${req.params.symbol}/price-data`, res));

// Rebase multiplier (dividend/split adjustments)
app.get("/assets/:symbol/multiplier",            gate, (req, res)  => proxy(`/assets/${req.params.symbol}/multiplier`, res));
app.get("/assets/:symbol/multiplier/history",    gate, (req, res)  => proxy(`/assets/${req.params.symbol}/multiplier/history`, res));

// Supply data
app.get("/assets/:symbol/supply",                gate, (req, res)  => proxy(`/assets/${req.params.symbol}/circulating-supply`, res));

// Proof of reserves
app.get("/reserves",                             gate, (_req, res) => proxy("/proof-of-reserves", res));
app.get("/reserves/:symbol",                     gate, (req, res)  => proxy(`/proof-of-reserves/${req.params.symbol}`, res));

// Price oracles (on-chain contract addresses by network)
app.get("/oracles",                              gate, (_req, res) => proxy("/oracles", res));
app.get("/oracles/:symbol",                      gate, (req, res)  => proxy(`/oracles/${req.params.symbol}`, res));

// Trading halt / market status
app.get("/status/:symbol",                       gate, (req, res)  => proxy(`/system/status/${req.params.symbol}`, res));

// Corporate actions (dividends, splits)
app.get("/corporate-actions/history",            gate, (_req, res) => proxy("/corporate-actions/history", res));
app.get("/corporate-actions/upcoming",           gate, (_req, res) => proxy("/corporate-actions/upcoming", res));

app.use((_req, res) => res.status(404).json({ error: "not found" }));

app.listen(Number(config.port), () => {
  console.log(`[x402-xstocks-feed] :${config.port}  $${Number(config.pricePerCall) / 1e6}/call → ${config.payTo.slice(0, 8)}…`);
});
