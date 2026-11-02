import express from "express";
import helmet from "helmet";
import cors from "cors";
import env from "./config.js";
import { noLogs } from "./middleware/noLogs.js";
import catalogRouter from "./routes/catalog.js";
import ordersRouter  from "./routes/orders.js";
import internalRouter from "./routes/internal.js";
import wellKnownRouter from "./routes/wellKnown.js";
import healthRouter  from "./routes/health.js";
import openapiRouter from "./routes/openapi.js";

const app = express();

app.set("trust proxy", false);
app.use(helmet());
app.use(cors({ origin: env.NODE_ENV === "production" ? false : "*" }));
app.use(express.json({ limit: "32kb" }));
app.use(noLogs);

// Minimal 1×1 transparent ICO for AgentCash favicon discovery
const FAVICON = Buffer.from(
  "000001000100010001000100200000001600000016000000" +
  "28000000010000000200000001002000000000000400000000000000000000000000000000000000" +
  "00000000",
  "hex",
);

app.get("/favicon.ico", (_req, res) => { res.set("Content-Type", "image/x-icon").end(FAVICON); });
app.use("/.well-known", wellKnownRouter);
app.use("/openapi.json", openapiRouter);
app.use("/health",       healthRouter);

// Public catalog — no payment needed
app.use("/api", catalogRouter);

// x402-gated orders
app.use("/api/orders", ordersRouter);

// Internal fulfillment — called by trusted sibling backends only
app.use("/api/internal", internalRouter);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[store] unhandled error:", err?.message ?? err);
  const status = err?.httpStatus ?? err?.status ?? 500;
  res.status(status).json({
    ok:    false,
    error: env.DEV_MODE ? (err?.message ?? "unknown") : "Internal server error",
    code:  "INTERNAL_ERROR",
  });
});

app.use((_req, res) => { res.status(404).json({ ok: false, error: "Not found" }); });

app.listen(env.PORT, () => {
  console.log(`[store] :${env.PORT}  commission=${(env.COMMISSION_RATE * 100).toFixed(1)}%  network=solana`);
});
