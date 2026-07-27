// Sumsub API client — HMAC-SHA256 signed requests
import crypto from "node:crypto";
import { config } from "./config.js";

const BASE = "https://api.sumsub.com";

function sign(method: string, path: string, body: string = ""): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const data = ts + method.toUpperCase() + path + body;
  const sig = crypto.createHmac("sha256", config.sumsubSecretKey).update(data).digest("hex");
  return {
    "X-App-Token":      config.sumsubAppToken,
    "X-App-Access-Ts":  ts,
    "X-App-Access-Sig": sig,
    "Content-Type":     "application/json",
    "X-Agent-Source":   "hfsp-x402-xstocks",
  };
}

// Mint a short-lived SDK access token for a wallet address.
// userId = wallet address (stable, ties KYC record to the wallet on-chain).
export async function mintAccessToken(wallet: string): Promise<{ token: string; userId: string }> {
  const ttl  = 600;
  const path = `/resources/accessTokens?userId=${encodeURIComponent(wallet)}&levelName=${encodeURIComponent(config.sumsubLevelName)}&ttlInSecs=${ttl}`;

  const res = await fetch(`${BASE}${path}`, {
    method:  "POST",
    headers: sign("POST", path),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sumsub accessToken error ${res.status}: ${err}`);
  }

  const data = await res.json() as { token: string; userId: string };
  return data;
}

// Read applicant status by externalUserId (= wallet address).
export async function getApplicantStatus(wallet: string): Promise<{
  applicantId: string;
  reviewStatus: string;
  reviewAnswer: string | null;
  rejectLabels: string[];
} | null> {
  const path = `/resources/applicants/${encodeURIComponent(wallet)}/one`;
  const res  = await fetch(`${BASE}${path}`, { headers: sign("GET", path) });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sumsub applicant fetch error ${res.status}`);

  const data = await res.json() as {
    id?: string;
    review?: {
      reviewStatus?: string;
      reviewResult?: { reviewAnswer?: string; rejectLabels?: string[] };
    };
  };

  return {
    applicantId:  data.id ?? "",
    reviewStatus: data.review?.reviewStatus ?? "init",
    reviewAnswer: data.review?.reviewResult?.reviewAnswer ?? null,
    rejectLabels: data.review?.reviewResult?.rejectLabels ?? [],
  };
}
