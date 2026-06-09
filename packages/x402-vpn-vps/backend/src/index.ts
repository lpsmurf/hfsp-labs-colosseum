import express from "express";
import helmet from "helmet";
import cors from "cors";
import env from "./config.js";
import { noLogs } from "./middleware/noLogs.js";
import { x402Gate } from "./middleware/x402.js";
import vpnRouter from "./routes/vpn.js";
import vpsRouter from "./routes/vps.js";
import wellKnownRouter from "./routes/wellKnown.js";
import healthRouter from "./routes/health.js";
import openapiRouter from "./routes/openapi.js";
import { startLeaseExpiryCron } from "./services/leaseExpiry.js";

const app = express();

app.set("trust proxy", false);
app.use(helmet());
const corsOrigin = env.NODE_ENV === "production" 
  ? (process.env.FRONTEND_URL || false)
  : "*";
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "64kb" }));
app.use(noLogs);

// Minimal 1x1 transparent ICO — satisfies AgentCash/browser favicon discovery
const FAVICON = Buffer.from(
  "000001000100010001000100200000001600000016000000" +
  "28000000010000000200000001002000000000000400000000000000000000000000000000000000" +
  "00000000",
  "hex"
);

// Unprotected routes first
app.get("/favicon.ico", (_req, res) => { res.set("Content-Type", "image/x-icon").end(FAVICON); });
app.use("/.well-known", wellKnownRouter);
app.use("/openapi.json", openapiRouter);
app.use("/health",      healthRouter);

// x402 gate — blocks /api/vpn/* and /api/vps/* until payment verified
// Paths not in routes config pass through untouched
app.use(x402Gate);

app.use("/api/vpn", vpnRouter);
app.use("/api/vps", vpsRouter);

// Global error handler before 404
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[server] Unhandled error:", err);
  res.status(err.status || 500).json({
    ok: false,
    error: env.DEV_MODE ? err.message : "Internal server error",
    code: "INTERNAL_ERROR",
  });
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not found", code: "NOT_FOUND" });
});

// Start cron with error handling before app.listen
(async () => {
  try {
    await startLeaseExpiryCron();
    app.listen(env.PORT, () => {
      console.log(`[server] :${env.PORT}  DEV_MODE=${env.DEV_MODE}  network=solana`);
    });
  } catch (err) {
    console.error("[server] Failed to start lease expiry cron:", err);
    process.exit(1);
  }
})();
