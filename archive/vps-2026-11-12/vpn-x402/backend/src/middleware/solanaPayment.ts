// Middleware factory: requires a confirmed mainnet Solana USDC payment before granting access.
//
// Replay protection: each txSig is recorded in Redis on first use. A second request
// with the same sig is rejected with TxAlreadyUsed (402) before Helius is even called.
//
// Agent discount: wallets in AGENT_WALLETS pay AGENT_MICRO_AMOUNT (100 atomic = $0.0001)
// instead of full price and still get real provisioning.
//
// Client flow:
//   1. POST endpoint → 402 JSON with pay instructions
//   2. Send Solana mainnet USDC to operator wallet
//   3. Retry with X-Solana-Tx: <confirmed-sig> → 200 + provisioning result
import type { Request, Response, NextFunction } from "express";
import { verifyHeliusTx } from "../services/heliusVerify.js";
import { redis } from "../services/leaseExpiry.js";
import { TxAlreadyUsed } from "../errors.js";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const OPERATOR  = process.env.OPERATOR_SOLANA_ADDRESS ?? "GdAWRcvrVabFi6QtciGJNYsS8cykJkZTNZ3cFea6ywfY";
const NETWORK   = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

const AGENT_MICRO_AMOUNT = 100n;

const AGENT_WALLETS: Set<string> = new Set(
  (process.env.AGENT_WALLETS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean),
);

function isAgent(wallet: string): boolean {
  return AGENT_WALLETS.has(wallet);
}

// Mark a txSig as used in Redis. TTL is 25 hours — long enough to cover any
// Solana finality window and block same-day replays.
async function claimTxSig(txSig: string): Promise<boolean> {
  const key = `tx:used:${txSig}`;
  // SET NX returns "OK" only if key didn't exist — atomic check-and-set
  const result = await redis.set(key, "1", "EX", 90_000, "NX");
  return result === "OK"; // true = first claim, false = replay
}

export function requireSolanaPayment(fullAmount: bigint, description: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const txSig = req.headers["x-solana-tx"] as string | undefined;

    if (!txSig) {
      const agentActive = AGENT_WALLETS.size > 0;
      const url = `https://vpn.hfsp.cloud${req.originalUrl.split("?")[0]}`;

      // x402 v2 challenge (PAYMENT-REQUIRED header = base64(JSON))
      const paymentRequired = {
        x402Version: 2,
        resource: { url, description, mimeType: "application/json" },
        accepts: [{
          scheme:            "exact",
          network:           NETWORK,
          amount:            fullAmount.toString(),
          asset:             USDC_MINT,
          payTo:             OPERATOR,
          maxTimeoutSeconds: 300,
          extra: {},
        }],
      };
      const encoded = Buffer.from(JSON.stringify(paymentRequired), "utf8").toString("base64");

      res.set("PAYMENT-REQUIRED", encoded)
         .status(402)
         .json({
           ...paymentRequired,
           // Extended fields for Solana agents: custom header flow
           ok:           false,
           error:        "Payment Required",
           pay: {
             amount:    Number(fullAmount),
             amountUsd: (Number(fullAmount) / 1_000_000).toFixed(4),
             mint:      USDC_MINT,
             payTo:     OPERATOR,
             network:   NETWORK,
             description,
             ...(agentActive ? {
               agentAmount:    Number(AGENT_MICRO_AMOUNT),
               agentAmountUsd: (Number(AGENT_MICRO_AMOUNT) / 1_000_000).toFixed(4),
               agentNote:      "Whitelisted agent wallets pay micro-price for full provisioning.",
             } : {}),
           },
           instructions: "Send Solana mainnet USDC, then retry with X-Solana-Tx: <signature>",
         });
      return;
    }

    // ── Replay protection ─────────────────────────────────────────────────────
    const claimed = await claimTxSig(txSig);
    if (!claimed) {
      const err = new TxAlreadyUsed(txSig);
      res.status(err.httpStatus).json(err.toResponse());
      return;
    }

    // ── Verify on-chain ───────────────────────────────────────────────────────
    // First-pass with micro-amount to resolve the sender wallet cheaply
    const probe = await verifyHeliusTx(txSig, USDC_MINT, OPERATOR, AGENT_MICRO_AMOUNT);
    if (!probe.ok) {
      // Release the claim so the user can retry with a valid tx
      await redis.del(`tx:used:${txSig}`);
      res.status(402).json({ ok: false, error: probe.error, txSig });
      return;
    }

    const sender   = probe.from ?? "";
    const required = isAgent(sender) ? AGENT_MICRO_AMOUNT : fullAmount;

    if (required > AGENT_MICRO_AMOUNT) {
      const full = await verifyHeliusTx(txSig, USDC_MINT, OPERATOR, fullAmount);
      if (!full.ok) {
        await redis.del(`tx:used:${txSig}`);
        res.status(402).json({
          ok:    false,
          error: full.error,
          hint:  `Wallet ${sender.slice(0, 12)}... is not an agent wallet. Full price $${(Number(fullAmount) / 1_000_000).toFixed(4)} required.`,
          txSig,
        });
        return;
      }
      (req as any).solanaPayment = { txSig, amount: full.amount, from: sender, agentDiscount: false };
    } else {
      (req as any).solanaPayment = { txSig, amount: probe.amount, from: sender, agentDiscount: true };
    }

    next();
  };
}
