/**
 * Express server with x402 payment gating.
 * Adds Solana USDC payment to any route in one line.
 */
import express from "express";
import { x402 } from "../src/server/index.js";

const app = express();
app.use(express.json());

const gate = x402({
  amount:      500_000n,                         // $0.50 USDC
  payTo:       process.env.OPERATOR_WALLET!,
  rpcUrl:      process.env.HELIUS_RPC_URL!,
  description: "AI analysis endpoint — $0.50 per request",
});

app.post("/api/analyze", gate, (req, res) => {
  res.json({
    result:  "analysis complete",
    paidBy:  req.solanaPayment?.from,
    txSig:   req.solanaPayment?.txSig,
  });
});

app.listen(3000, () => console.log("Listening on :3000"));
