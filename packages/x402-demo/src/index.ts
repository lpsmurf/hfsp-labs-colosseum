import "dotenv/config";
import express     from "express";
import helmet      from "helmet";
import cors        from "cors";
import { x402 }   from "@hfsp/x402-sdk/server";

const PORT           = process.env.PORT           ?? "3010";
const OPERATOR_WALLET = process.env.OPERATOR_WALLET ?? "";
const HELIUS_RPC_URL  = process.env.HELIUS_RPC_URL  ?? "";

if (!OPERATOR_WALLET || !HELIUS_RPC_URL) {
  console.error("Missing OPERATOR_WALLET or HELIUS_RPC_URL");
  process.exit(1);
}

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// ── Free endpoints ─────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "x402-demo", version: "0.1.0" });
});

// Explain the protocol + link to SDK
app.get("/", (_req, res) => {
  res.json({
    ok:      true,
    service: "@hfsp/x402-sdk demo",
    docs:    "https://github.com/lpsmurf/hfsp-labs-colosseum/tree/main/packages/x402-sdk",
    npm:     "https://www.npmjs.com/package/@hfsp/x402-sdk",
    endpoints: {
      "GET  /":              "this page",
      "GET  /health":        "health check (free)",
      "POST /api/hello":     "$0.001 USDC — returns a greeting",
      "POST /api/echo":      "$0.005 USDC — echoes your request body back",
      "POST /api/timestamp": "$0.001 USDC — returns a server timestamp",
    },
    how_to_pay: [
      "1. Call any /api/* endpoint — get a 402 with payment instructions",
      "2. Send the listed USDC amount to `pay.payTo` on Solana mainnet",
      "3. Retry with header: X-Solana-Tx: <confirmed-signature>",
      "4. Get your response",
    ],
    sdk_quickstart: [
      "npm install @hfsp/x402-sdk",
      "import { X402Client } from '@hfsp/x402-sdk/client';",
      "const client = new X402Client({ wallet, rpcUrl });",
      "const res = await client.fetch('https://demo.hfsp.cloud/api/hello', { method: 'POST' });",
    ],
  });
});

// ── Payment-gated endpoints ────────────────────────────────────────────────

// $0.001 — cheapest possible gate, perfect for demos and tests
const microGate = x402({
  amount:  1_000n,
  payTo:   OPERATOR_WALLET,
  rpcUrl:  HELIUS_RPC_URL,
  description: "x402-demo hello — $0.001 USDC",
});

app.post("/api/hello", microGate, (req, res) => {
  res.json({
    ok:      true,
    message: "Hello from @hfsp/x402-sdk! You just paid $0.001 USDC on Solana.",
    paidBy:  req.solanaPayment?.from,
    txSig:   req.solanaPayment?.txSig,
    amount:  req.solanaPayment?.amount,
    sdk:     "npm install @hfsp/x402-sdk",
  });
});

app.post("/api/timestamp", microGate, (req, res) => {
  res.json({
    ok:        true,
    timestamp: new Date().toISOString(),
    paidBy:    req.solanaPayment?.from,
    txSig:     req.solanaPayment?.txSig,
  });
});

// $0.005 — slightly more expensive to show variable pricing
const echoGate = x402({
  amount:  5_000n,
  payTo:   OPERATOR_WALLET,
  rpcUrl:  HELIUS_RPC_URL,
  description: "x402-demo echo — $0.005 USDC",
});

app.post("/api/echo", echoGate, (req, res) => {
  res.json({
    ok:      true,
    echo:    req.body,
    paidBy:  req.solanaPayment?.from,
    txSig:   req.solanaPayment?.txSig,
  });
});

// ── 404 ────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`[x402-demo] Listening on :${PORT}`);
  console.log(`[x402-demo] Operator wallet: ${OPERATOR_WALLET.slice(0, 8)}...`);
});
