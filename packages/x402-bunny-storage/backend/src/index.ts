import express from "express";
import helmet from "helmet";
import cors from "cors";
import env from "./config.js";
import { noLogs } from "./middleware/noLogs.js";
import uploadRouter   from "./routes/upload.js";
import wellKnownRouter from "./routes/wellKnown.js";
import healthRouter   from "./routes/health.js";
import openapiRouter  from "./routes/openapi.js";

const app = express();

app.set("trust proxy", false);
app.use(helmet());
app.use(cors({ origin: env.NODE_ENV === "production" ? false : "*" }));
app.use(noLogs);

app.use("/.well-known", wellKnownRouter);
app.use("/openapi.json", openapiRouter);
app.use("/health",       healthRouter);

// x402-gated uploads — mounts its own express.raw() body parser
app.use("/api/upload", uploadRouter);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[bunny-storage] unhandled error:", err?.message ?? err);
  const status = err?.httpStatus ?? err?.status ?? 500;
  res.status(status).json({
    ok:    false,
    error: env.DEV_MODE ? (err?.message ?? "unknown") : "Internal server error",
    code:  "INTERNAL_ERROR",
  });
});

app.use((_req, res) => { res.status(404).json({ ok: false, error: "Not found" }); });

app.listen(env.PORT, () => {
  console.log(`[bunny-storage] :${env.PORT}  price=$${env.PRICE_PER_MB_USDC}/MB  min=$${env.MIN_PRICE_USDC}  network=solana`);
});
