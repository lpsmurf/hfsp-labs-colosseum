import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { setKyc } from "../kyc-store.js";

export const webhookRouter = Router();

const ALG: Record<string, string> = {
  // Retained only for backward compatibility with legacy webhooks still
  // configured for SHA1. Sumsub defaults to SHA256 — prefer SHA256/SHA512.
  HMAC_SHA1_HEX:   "sha1",
  HMAC_SHA256_HEX: "sha256",
  HMAC_SHA512_HEX: "sha512",
};

// Sumsub signs over raw bytes. bodyParser.raw() is required on this route.
// Express app must mount this router BEFORE the global json() parser.
function verifySignature(rawBody: Buffer, req: Request): boolean {
  if (!config.sumsubWebhookSecret) return true; // dev mode: skip if not configured
  const algName = ALG[req.header("x-payload-digest-alg") ?? "HMAC_SHA256_HEX"] ?? "sha256";
  const expected = req.header("x-payload-digest") ?? "";
  const actual   = crypto.createHmac(algName, config.sumsubWebhookSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// POST /api/webhooks/sumsub
// Accepts raw body (mounted in index.ts with express.raw()).
webhookRouter.post("/sumsub", (req: Request, res: Response) => {
  const rawBody = req.body as Buffer;

  if (!verifySignature(rawBody, req)) {
    res.status(403).json({ error: "invalid signature" });
    return;
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "invalid JSON" });
    return;
  }

  const type = event.type as string;

  if (type === "applicantReviewed") {
    const review  = event.reviewResult as { reviewAnswer?: string; rejectLabels?: string[] } | undefined;
    const wallet  = event.externalUserId as string;
    const appId   = event.applicantId as string;
    const answer  = review?.reviewAnswer;

    if (wallet) {
      // Only act on a definitive verdict. A null/undefined answer means the
      // review is still in progress — leaving it untouched avoids prematurely
      // marking pending applicants as rejected.
      if (answer === "GREEN" || answer === "RED") {
        const status = answer === "GREEN" ? "approved" : "rejected";
        setKyc({
          wallet,
          status,
          applicantId:  appId ?? wallet,
          updatedAt:    new Date().toISOString(),
          rejectLabels: review?.rejectLabels ?? [],
        });
        console.log(`[webhook] ${wallet} → ${status} (${answer})`);
      } else {
        console.log(`[webhook] ${wallet} reviewed with no definitive answer — leaving status unchanged`);
      }
    }
  }

  // Always 200 to prevent Sumsub retries.
  res.json({ ok: true });
});
