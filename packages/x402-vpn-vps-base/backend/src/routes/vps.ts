// VPS routes — one endpoint per tier.
// Payment: x402 on Base mainnet via x402.org facilitator (X-PAYMENT header).
// Agent flow: POST /api/vps/hour → 402 → wallet signs Base USDC transfer →
//             retry with X-PAYMENT header → facilitator verifies → { ip, wireguardClientConf }
import { Router } from "express";
import { z } from "zod";
import { claimLimiter } from "../middleware/rateLimiter.js";
import { createVpsServer } from "../services/hetzner.js";
import { registerServerLease } from "../services/leaseExpiry.js";
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
  // Require a valid OpenSSH Ed25519 public key: prefix + base64 payload
  sshPublicKey: z.string().min(68).regex(/^ssh-ed25519 [A-Za-z0-9+/=]+(?: .*)?$/, 'sshPublicKey must be a valid OpenSSH Ed25519 public key'),
});

async function provision(period: string) {
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

      const payment = (req as any).payment ?? {};
      res.json({
        ok:   true,
        data: { ip: server.ip, wireguardClientConf: server.wireguardClientConf },
        payment: {
          txHash:  payment.transaction?.hash,
          network: "base",
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
  res.json({ ok: true, regions: REGION_INFO, default: "DE_NBG" });
});

router.post("/hour", claimLimiter, provision("hour"));
router.post("/day",  claimLimiter, provision("day"));
router.post("/week", claimLimiter, provision("week"));

export default router;
