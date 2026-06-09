// VPN routes — one endpoint per tier.
// Payment: x402 on Base mainnet via x402.org facilitator (X-PAYMENT header).
// Agent flow: POST /api/vpn/week → 402 → wallet signs Base USDC transfer →
//             retry with X-PAYMENT header → facilitator verifies → { ip, serverWgPubKey }
import { Router } from "express";
import { z } from "zod";
import { claimLimiter } from "../middleware/rateLimiter.js";
import { createVpnServer } from "../services/hetzner.js";
import { registerServerLease } from "../services/leaseExpiry.js";
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
  // X25519 public key (WireGuard) — base64, exactly 44 chars (32-byte key encoded)
  clientWgPublicKey: z.string().length(44).regex(/^[A-Za-z0-9+/=]+$/, 'Invalid WireGuard public key (must be base64 44 chars)'),
});

async function provision(period: string) {
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

      // x402 middleware attaches payment info at req.payment after verification
      const payment = (req as any).payment ?? {};
      res.json({
        ok:   true,
        data: { ip: server.ip, serverWgPubKey: server.serverWgPubKey },
        payment: {
          txHash:  payment.transaction?.hash,
          network: "base",
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

router.post("/hour",  claimLimiter, provision("hour"));
router.post("/day",   claimLimiter, provision("day"));
router.post("/week",  claimLimiter, provision("week"));
router.post("/month", claimLimiter, provision("month"));

export default router;
