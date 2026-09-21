import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { config } from "./config.js";
import { kycRouter } from "./routes/kyc.js";
import { webhookRouter } from "./routes/webhook.js";
import { xchangeRouter } from "./routes/xchange.js";
import { preflightRouter } from "./routes/preflight.js";
import { requireKyc } from "./middleware/require-kyc.js";

const app = express();

app.use(helmet());
app.use(cors());

// Webhook route needs raw bytes for HMAC verification — mount BEFORE json parser.
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRouter);

// All other routes use JSON body parsing.
app.use(express.json());

// KYC routes (open — unauthenticated users need to start KYC).
app.use("/api/kyc", kycRouter);

// Pre-flight ATA check — gated by KYC, not x402.
// Mount BEFORE the less-specific /api/xchange router, or that prefix match
// would shadow this route and it would never be reached.
app.use("/api/xchange/preflight", requireKyc, preflightRouter);

// xChange routes gated by KYC.
app.use("/api/xchange", requireKyc, xchangeRouter);

// Health check.
app.get("/health", (_req, res) => res.json({ ok: true, env: config.nodeEnv }));

app.listen(Number(config.port), () => {
  console.log(`[x402-xstocks] running on http://localhost:${config.port}`);
});
