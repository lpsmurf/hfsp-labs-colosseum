// x402 resource server — Solana-only configuration.
// Payment enforcement is handled per-route via requireSolanaPayment (Helius verification).
// This module exists for the well-known discovery manifest and to hold shared constants.
// No Base/EVM support here — see packages/x402-vpn-vps-base for the Base variant.
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import type { RoutesConfig } from "@x402/core/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import env from "../config.js";

const SOL_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Shared constants re-exported for route handlers
export const SOLANA_USDC = SOL_USDC;

export const TEST_PROBE = {
  amount:  100n,
  mint:    SOL_USDC,
  payTo:   env.OPERATOR_SOLANA_ADDRESS,
  network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
};

// Routes are empty: payment is enforced in-route via requireSolanaPayment + Helius.
// Once an x402 facilitator supporting Solana mainnet is available,
// repopulate this config to unify the payment layer.
export const routes: RoutesConfig = {};

const facilitator = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
const server      = new x402ResourceServer(facilitator)
  .register("solana:*", new ExactSvmScheme());

export const x402Gate = paymentMiddleware(routes, server, undefined, undefined, false);
