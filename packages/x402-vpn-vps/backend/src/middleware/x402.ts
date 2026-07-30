// x402 V2 resource server — Solana mainnet.
//
// Until mid-2026 there was no facilitator that settled Solana mainnet, so payment
// here was enforced entirely by requireSolanaPayment + Helius tx verification and
// this file held an empty routes config. That is no longer true: PayAI serves
// x402Version 2 `exact` on solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp, so the routes
// below are now really gated by the SDK.
//
// Both paths run side by side:
//   PAYMENT-SIGNATURE → handled here, settled by the facilitator.
//   X-Solana-Tx       → handled by requireSolanaPayment, verified via Helius.
// The legacy path stays until we can see it has no traffic left.
import type { Request, Response, NextFunction } from "express";
import {
  createResourceServer,
  buildGate,
  gate,
  NETWORKS,
  USDC,
  type RoutesConfig,
} from "@hfsp/x402-common";
import env from "../config.js";

const SOL_USDC = USDC.solana;

// Shared constants re-exported for route handlers
export const SOLANA_USDC = SOL_USDC;

export const TEST_PROBE = {
  amount:  100n,
  mint:    SOL_USDC,
  payTo:   env.OPERATOR_SOLANA_ADDRESS,
  network: NETWORKS.solana,
};

/** Prices in dollars, matching the atomic amounts in the route handlers. */
const PRICES = {
  vpnHour:  0.20,
  vpnDay:   0.79,
  vpnWeek:  2.99,
  vpnMonth: 7.99,
  vpsHour:  0.25,
  vpsDay:   0.99,
  vpsWeek:  3.99,
} as const;

function solanaGate(price: number, description: string) {
  return gate({ price, payTo: env.OPERATOR_SOLANA_ADDRESS, network: "solana", description });
}

export const routes: RoutesConfig = {
  "POST /api/vpn/hour":  solanaGate(PRICES.vpnHour,  "Anonymous WireGuard VPN — 1-hour pass"),
  "POST /api/vpn/day":   solanaGate(PRICES.vpnDay,   "Anonymous WireGuard VPN — 24-hour pass"),
  "POST /api/vpn/week":  solanaGate(PRICES.vpnWeek,  "Anonymous WireGuard VPN — 7-day pass"),
  "POST /api/vpn/month": solanaGate(PRICES.vpnMonth, "Anonymous WireGuard VPN — 30-day pass"),
  "POST /api/vps/hour":  solanaGate(PRICES.vpsHour,  "Ephemeral Hetzner VPS — 1-hour pass"),
  "POST /api/vps/day":   solanaGate(PRICES.vpsDay,   "Ephemeral Hetzner VPS — 24-hour pass"),
  "POST /api/vps/week":  solanaGate(PRICES.vpsWeek,  "Ephemeral Hetzner VPS — 7-day pass"),
};

const server = createResourceServer({
  facilitatorUrl: env.FACILITATOR_URL,
  families:       ["svm"],
  networks:       ["solana"],
});

const sdkGate = buildGate(routes, server);

/**
 * Run the standard V2 gate, unless the caller is on the legacy Helius path.
 *
 * A client sending X-Solana-Tx falls through to requireSolanaPayment, which knows
 * how to verify a broadcast transaction. Without this split, migrating would 402
 * every existing integration.
 */
export function x402Gate(req: Request, res: Response, next: NextFunction) {
  if (usesLegacyPayment(req)) return next();
  return sdkGate(req, res, next);
}

export function usesLegacyPayment(req: Request): boolean {
  const legacy = (req.headers["x-solana-tx"] as string | undefined)?.trim();
  const v2     = (req.headers["payment-signature"] as string | undefined)?.trim();
  return Boolean(legacy) && !v2;
}
