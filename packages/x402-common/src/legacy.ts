/**
 * V2-shaped helpers for services that still settle through a custom path.
 *
 * This is a bridge, not a destination. A service using these speaks the V2 wire
 * format — correct headers, CAIP-2 networks, `x402Version: 2` — so standard
 * clients can discover and parse it, while settlement still runs through our own
 * verifier. Anything here should eventually be replaced by `createResourceServer`.
 */

import type { Response } from "express";
import { NETWORKS, USDC, usdc, type NetworkName } from "./networks.js";

export const HEADER = {
  /** Server → client, base64 PaymentRequired. V1 sent this in the body instead. */
  required:  "PAYMENT-REQUIRED",
  /** Client → server, base64 PaymentPayload. Was `X-PAYMENT` in V1. */
  signature: "PAYMENT-SIGNATURE",
  /** Server → client, base64 SettlementResponse. Was `X-PAYMENT-RESPONSE` in V1. */
  response:  "PAYMENT-RESPONSE",
} as const;

export interface ChallengeOptions {
  resourceUrl: string;
  description: string;
  price: number;
  payTo: string;
  network: NetworkName;
  mimeType?: string;
  maxTimeoutSeconds?: number;
}

export interface PaymentRequiredV2 {
  x402Version: 2;
  resource: { url: string; description: string; mimeType: string };
  accepts: Array<{
    scheme: string;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra: Record<string, unknown>;
  }>;
}

/** Build a spec-shaped PaymentRequired object. */
export function buildChallenge(opts: ChallengeOptions): PaymentRequiredV2 {
  return {
    x402Version: 2,
    resource: {
      url:         opts.resourceUrl,
      description: opts.description,
      mimeType:    opts.mimeType ?? "application/json",
    },
    accepts: [{
      scheme:            "exact",
      network:           NETWORKS[opts.network],
      amount:            usdc(opts.price),
      asset:             USDC[opts.network],
      payTo:             opts.payTo,
      maxTimeoutSeconds: opts.maxTimeoutSeconds ?? 300,
      extra:             {},
    }],
  };
}

export function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function decode<T = unknown>(encoded: string): T | null {
  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Send a 402 carrying the V2 `PAYMENT-REQUIRED` header.
 *
 * `extraBody` is merged into the JSON body for our own custom clients. The header
 * is what standard clients read; the body is a convenience that costs nothing.
 */
export function send402(
  res: Response,
  challenge: PaymentRequiredV2,
  extraBody: Record<string, unknown> = {},
): void {
  res.set(HEADER.required, encode(challenge))
     .status(402)
     .json({ ...challenge, ...extraBody });
}

/**
 * Attach the settlement receipt a paying client is entitled to.
 *
 * Without this an agent has no machine-readable record of what it just spent,
 * which breaks budget tracking on the client side.
 */
export function attachReceipt(
  res: Response,
  receipt: { success: boolean; network: NetworkName; transaction: string; payer?: string },
): void {
  res.set(HEADER.response, encode({
    success:     receipt.success,
    network:     NETWORKS[receipt.network],
    transaction: receipt.transaction,
    ...(receipt.payer ? { payer: receipt.payer } : {}),
  }));
}

/**
 * Read a payment proof from either the V2 header or a legacy one.
 *
 * Order matters: V2 first, so a client that sends both is treated as V2.
 */
export function readProof(
  headers: Record<string, unknown>,
  ...legacyNames: string[]
): { value: string; header: string } | null {
  const names = [HEADER.signature, ...legacyNames];
  for (const name of names) {
    const raw = headers[name.toLowerCase()];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value) return { value, header: name };
  }
  return null;
}
