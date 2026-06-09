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
app.use(cors({ origin: env.NODE_ENV === "production" ? false : "*" }));
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

// x402 gate — enforces Base USDC payment on /api/vpn/* and /api/vps/*
// Facilitator verifies on-chain before the request reaches any handler
app.use(x402Gate);

app.use("/api/vpn", vpnRouter);
app.use("/api/vps", vpsRouter);

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not found", code: "NOT_FOUND" });
});

startLeaseExpiryCron();

app.listen(env.PORT, () => {
  console.log(`[server] :${env.PORT}  DEV_MODE=${env.DEV_MODE}  network=base`);
  console.log(`[server] Base recipient:   ${env.OPERATOR_BASE_ADDRESS}`);
  console.log(`[server] Facilitator:      ${env.FACILITATOR_URL}`);
});
