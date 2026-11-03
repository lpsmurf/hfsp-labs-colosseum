import { Router, Request, Response } from "express";
import { mintAccessToken, getApplicantStatus } from "../sumsub.js";
import { getKyc, setKyc } from "../kyc-store.js";

export const kycRouter = Router();

// POST /api/kyc/token
// Mints a short-lived Sumsub WebSDK access token.
// In production this route must be behind auth middleware — the wallet param
// should come from the authenticated session, not the request body.
kycRouter.post("/token", async (req: Request, res: Response) => {
  const wallet = (req.body?.wallet ?? req.query.wallet) as string | undefined;

  // Solana addresses are base58-encoded 32-byte keys → 32–44 chars, no 0/O/I/l.
  if (!wallet || typeof wallet !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    res.status(400).json({ error: "valid base58 Solana wallet address required" });
    return;
  }

  // Mark as pending if not already tracked.
  const current = getKyc(wallet);
  if (current.status === "none") {
    setKyc({ wallet, status: "pending", applicantId: "", updatedAt: "" });
  }

  try {
    const { token, userId } = await mintAccessToken(wallet);
    res.json({ token, userId });
  } catch (err) {
    console.error("[kyc/token]", err);
    res.status(502).json({ error: "failed to mint access token" });
  }
});

// GET /api/kyc/status/:wallet
kycRouter.get("/status/:wallet", async (req: Request, res: Response) => {
  const { wallet } = req.params;

  // Try to refresh from Sumsub if we don't have a definitive answer locally.
  const local = getKyc(wallet);
  if (local.status === "none" || local.status === "pending") {
    try {
      const remote = await getApplicantStatus(wallet);
      if (remote) {
        const status =
          remote.reviewAnswer === "GREEN" ? "approved" :
          remote.reviewAnswer === "RED"   ? "rejected" :
          "pending";
        setKyc({
          wallet,
          status,
          applicantId: remote.applicantId,
          updatedAt:   new Date().toISOString(),
          rejectLabels: remote.rejectLabels,
        });
      }
    } catch (err) {
      // Best-effort — return cached status if Sumsub is unavailable.
      console.error(`[kyc/status] Sumsub refresh failed for ${wallet}:`, err instanceof Error ? err.message : err);
    }
  }

  res.json(getKyc(wallet));
});
