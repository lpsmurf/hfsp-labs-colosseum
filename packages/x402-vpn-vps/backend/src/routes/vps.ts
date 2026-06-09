// VPS routes — one endpoint per tier.
// Payment: direct Solana mainnet USDC via Helius tx verification (X-Solana-Tx header).
// Agent flow: POST /api/vps/hour → 402 → pay on-chain → confirm via Helius → retry → { ip, wireguardClientConf, expiresAt }
import { Router } from "express";
import { z } from "zod";
import { claimLimiter } from "../middleware/rateLimiter.js";
import { requireSolanaPayment } from "../middleware/solanaPayment.js";
import { createVpsServer } from "../services/hetzner.js";
import { registerServerLease } from "../services/leaseExpiry.js";
import { verifyHeliusTx } from "../services/heliusVerify.js";
import { TEST_PROBE } from "../middleware/x402.js";
import { AppError, ValidationError } from "../errors.js";

const router = Router();

const VALID_REGIONS = ["DE_NBG","FI_HEL","US_HIL","SG_SIN"] as const;

const REGION_INFO = [
  { id: "DE_NBG", city: "Nuremberg, Germany",      continent: "EU"   },
  { id: "FI_HEL", city: "Helsinki, Finland",       continent: "EU"   },
  { id: "US_HIL", city: "Hillsboro, Oregon, USA",  continent: "US"   },
  { id: "SG_SIN", city: "Singapore",               continent: "APAC" },
];

const DURATION_MS: Record<string, number> = {
  hour: 3_600_000,
  day:  86_400_000,
  week: 604_800_000,
};

const Body = z.object({
  region:       z.enum(VALID_REGIONS).default("DE_NBG"),
  sshPublicKey: z.string().min(20), // OpenSSH Ed25519 — operator never sees private key
});

function provision(period: string) {
  return async (req: any, res: any) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      const ve = new ValidationError(parsed.error.issues.map(i => i.message).join(", "));
      res.status(ve.httpStatus).json(ve.toResponse());
      return;
    }

    const { region, sshPublicKey } = parsed.data;

    try {
      const server     = await createVpsServer(region, sshPublicKey);
      const durationMs = DURATION_MS[period];
      const expiresAt  = new Date(Date.now() + durationMs);

      await registerServerLease(server.id, expiresAt);

      const payment = req.solanaPayment ?? {};
      res.json({
        ok:   true,
        data: { ip: server.ip, wireguardClientConf: server.wireguardClientConf },
        payment: {
          txSig:  payment.txSig,
          amount: payment.amount,
          helius: payment.txSig ? `https://explorer.helius.xyz/tx/${payment.txSig}` : undefined,
        },
        expiresAt: expiresAt.toISOString(),
      });
    } catch (err) {
      if (err instanceof AppError) {
        console.error(`[vps/${period}] ${err.code}:`, err.detail ?? err.message);
        res.status(err.httpStatus).json(err.toResponse());
      } else {
        console.error(`[vps/${period}]`, err);
        res.status(500).json({ ok: false, code: "INTERNAL_ERROR", error: "Unexpected server error" });
      }
    }
  };
}

// Regions endpoint — list available geolocations before user commits to a region
router.get("/regions", (_req: any, res: any) => {
  res.json({ ok: true, regions: REGION_INFO, default: "DE_FSN" });
});

// Payment middleware extended with region info so the 402 response is self-contained
function requirePaymentWithRegions(amount: bigint, description: string) {
  const base = requireSolanaPayment(amount, description);
  return async (req: any, res: any, next: any) => {
    // Intercept the 402 to inject region list
    const origJson = res.json.bind(res);
    res.json = (body: any) => {
      if (body?.error === "Payment required") body.regions = REGION_INFO;
      return origJson(body);
    };
    return base(req, res, next);
  };
}

router.post("/hour", requirePaymentWithRegions(250_000n, "Ephemeral Hetzner VPS — 1-hour pass"),    claimLimiter, provision("hour"));
router.post("/day",  requirePaymentWithRegions(990_000n, "Ephemeral Hetzner VPS — 24-hour pass"),   claimLimiter, provision("day"));
router.post("/week", requirePaymentWithRegions(3_990_000n, "Ephemeral Hetzner VPS — 7-day pass"),   claimLimiter, provision("week"));
// Dev probe — verifies a direct mainnet Solana USDC payment via Helius (no x402 facilitator).
// Flow: POST /api/vps/test → 402 hint → client sends 100 micro-USDC on mainnet Solana →
//       waits for Helius confirmation → retries with X-SOLANA-TX: <sig> → 200
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
