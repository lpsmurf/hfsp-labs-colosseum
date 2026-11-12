// VPN routes — one endpoint per tier.
// Payment: direct Solana mainnet USDC via Helius tx verification (X-Solana-Tx header).
// Agent flow: POST /api/vpn/hour → 402 → pay on-chain → confirm via Helius → retry → { ip, serverWgPubKey }
import { Router } from "express";
import { z } from "zod";
import { claimLimiter } from "../middleware/rateLimiter.js";
import { requireSolanaPayment } from "../middleware/solanaPayment.js";
import { createVpnServer } from "../services/hetzner.js";
import { registerServerLease } from "../services/leaseExpiry.js";
import { verifyHeliusTx } from "../services/heliusVerify.js";
import { TEST_PROBE } from "../middleware/x402.js";
import { AppError, ValidationError } from "../errors.js";

const router = Router();

const VALID_REGIONS = ["DE_NBG","FI_HEL","US_HIL","SG_SIN"] as const;

const DURATION_MS: Record<string, number> = {
  hour:  3_600_000,
  day:   86_400_000,
  week:  604_800_000,
  month: 2_592_000_000,
};

const Body = z.object({
  region:            z.enum(VALID_REGIONS).default("DE_NBG"),
  clientWgPublicKey: z.string().min(40), // base64 X25519, generated client-side
});

function provision(period: string) {
  return async (req: any, res: any) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      const ve = new ValidationError(parsed.error.issues.map(i => i.message).join(", "));
      res.status(ve.httpStatus).json(ve.toResponse());
      return;
    }

    const { region, clientWgPublicKey } = parsed.data;

    try {
      const server     = await createVpnServer(region, clientWgPublicKey);
      const durationMs = DURATION_MS[period];
      const expiresAt  = new Date(Date.now() + durationMs);

      await registerServerLease(server.id, expiresAt);

      const payment = req.solanaPayment ?? {};
      res.json({
        ok:   true,
        data: {
          ip:             server.ip,
          serverWgPubKey: server.serverWgPubKey,
          wgPort:         51820,
          clientTunnelIp: "10.8.0.2",
        },
        payment: {
          txSig:   payment.txSig,
          amount:  payment.amount,
          helius:  payment.txSig ? `https://explorer.helius.xyz/tx/${payment.txSig}` : undefined,
        },
        expiresAt: expiresAt.toISOString(),
      });
    } catch (err) {
      if (err instanceof AppError) {
        console.error(`[vpn/${period}] ${err.code}:`, err.detail ?? err.message);
        res.status(err.httpStatus).json(err.toResponse());
      } else {
        console.error(`[vpn/${period}]`, err);
        res.status(500).json({ ok: false, code: "INTERNAL_ERROR", error: "Unexpected server error" });
      }
    }
  };
}

const REGION_INFO = [
  { id: "DE_NBG", city: "Nuremberg, Germany",      continent: "EU"   },
  { id: "FI_HEL", city: "Helsinki, Finland",       continent: "EU"   },
  { id: "US_HIL", city: "Hillsboro, Oregon, USA",  continent: "US"   },
  { id: "SG_SIN", city: "Singapore",               continent: "APAC" },
];

router.get("/regions", (_req: any, res: any) => {
  res.json({ ok: true, regions: REGION_INFO, default: "DE_NBG" });
});

router.post("/hour",  requireSolanaPayment(200_000n, "Anonymous WireGuard VPN — 1-hour pass"),  claimLimiter, provision("hour"));
router.post("/day",   requireSolanaPayment(790_000n, "Anonymous WireGuard VPN — 24-hour pass"), claimLimiter, provision("day"));
router.post("/week",  requireSolanaPayment(2_990_000n, "Anonymous WireGuard VPN — 7-day pass"), claimLimiter, provision("week"));
router.post("/month", requireSolanaPayment(7_990_000n, "Anonymous WireGuard VPN — 30-day pass"),claimLimiter, provision("month"));

// Dev probe — verifies payment without provisioning (100 micro-USDC = $0.0001)
router.post("/test", claimLimiter, async (req: any, res: any) => {
  const txSig = req.headers["x-solana-tx"] as string | undefined;

  if (!txSig) {
    res.status(402).json({
      ok:    false,
      error: "Payment required",
      pay: {
        amount:    Number(TEST_PROBE.amount),
        amountUsd: (Number(TEST_PROBE.amount) / 1_000_000).toFixed(4),
        mint:      TEST_PROBE.mint,
        payTo:     TEST_PROBE.payTo,
        network:   TEST_PROBE.network,
      },
      instructions: "Send Solana mainnet USDC, then retry with X-Solana-Tx: <signature>",
    });
    return;
  }

  const result = await verifyHeliusTx(txSig, TEST_PROBE.mint, TEST_PROBE.payTo, TEST_PROBE.amount);
  if (!result.ok) {
    res.status(402).json({ ok: false, error: result.error, txSig });
    return;
  }

  res.json({
    ok:      true,
    probe:   true,
    message: "Solana mainnet USDC payment verified via Helius",
    txSig,
    amount:  result.amount,
    network: TEST_PROBE.network,
    helius:  `https://explorer.helius.xyz/tx/${txSig}`,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
});

export default router;
