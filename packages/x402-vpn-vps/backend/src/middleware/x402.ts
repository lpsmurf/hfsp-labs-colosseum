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
  multiGate,
  FACILITATORS,
  NETWORKS,
  USDC,
  type GateOptions,
  type NetworkName,
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

// Celo is opt-in: half-configured, it would advertise a payment the facilitator
// then refuses to settle.
const celoRecipient = env.CELO_PAYMENT_RECIPIENT && env.CELO_FACILITATOR_API_KEY
  ? env.CELO_PAYMENT_RECIPIENT
  : undefined;

/**
 * Payment options for one route, same dollar price on every rail.
 *
 * On Celo, USDC is listed before USDT: stock x402 clients (≥ 2.23) accept only
 * default assets unless the buyer opts in, and USDC is the Celo default.
 */
// DEV_MODE runs on testnets so real funds are never required during development.
// Celo Sepolia has no USDT, so testnet offers USDC only.
export const rails = {
  primary:            (env.DEV_MODE ? "solanaDevnet" : "solana") as NetworkName,
  celo:               celoRecipient ? (env.DEV_MODE ? "celoSepolia" : "celo") as NetworkName : undefined,
  celoAssets:         (env.DEV_MODE ? ["USDC"] : ["USDC", "USDT"]) as Array<"USDC" | "USDT">,
  facilitator:        env.FACILITATOR_URL,
  celoFacilitator:    celoRecipient ? FACILITATORS[env.DEV_MODE ? "celoSepolia" : "celo"] : undefined,
};

function options(price: number, description: string): GateOptions[] {
  return [
    { price, payTo: env.OPERATOR_SOLANA_ADDRESS, network: rails.primary, description },
    ...(celoRecipient && rails.celo ? rails.celoAssets.map(asset => (
      { price, payTo: celoRecipient, network: rails.celo!, asset, description }
    )) : []),
  ];
}

const route = (price: number, description: string) => multiGate(description, options(price, description));

export const routes: RoutesConfig = {
  "POST /api/vpn/hour":  route(PRICES.vpnHour,  "Anonymous WireGuard VPN — 1-hour pass"),
  "POST /api/vpn/day":   route(PRICES.vpnDay,   "Anonymous WireGuard VPN — 24-hour pass"),
  "POST /api/vpn/week":  route(PRICES.vpnWeek,  "Anonymous WireGuard VPN — 7-day pass"),
  "POST /api/vpn/month": route(PRICES.vpnMonth, "Anonymous WireGuard VPN — 30-day pass"),
  "POST /api/vps/hour":  route(PRICES.vpsHour,  "Ephemeral Hetzner VPS — 1-hour pass"),
  "POST /api/vps/day":   route(PRICES.vpsDay,   "Ephemeral Hetzner VPS — 24-hour pass"),
  "POST /api/vps/week":  route(PRICES.vpsWeek,  "Ephemeral Hetzner VPS — 7-day pass"),
};

export const enabledNetworks: NetworkName[] = rails.celo ? [rails.primary, rails.celo] : [rails.primary];

const server = createResourceServer({
  facilitatorUrl:    env.FACILITATOR_URL,
  families:          celoRecipient ? ["svm", "evm"] : ["svm"],
  networks:          enabledNetworks,
  extraFacilitators: rails.celoFacilitator ? [{ url: rails.celoFacilitator, apiKey: env.CELO_FACILITATOR_API_KEY }] : [],
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
