// x402 payment gate for Base mainnet.
// Uses the x402.org facilitator to verify USDC payments on Base.
// Each route has its price set here; the facilitator validates amount + recipient on-chain.
// No private keys. Payment goes directly to OPERATOR_BASE_ADDRESS.
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import type { RoutesConfig } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import env from "../config.js";

// ── Networks ───────────────────────────────────────────────────────────────
// DEV_MODE uses Base Sepolia so real USDC is not required during development
const BASE_NETWORK: Network = env.DEV_MODE ? "eip155:84532" : "eip155:8453";

// ── Assets ─────────────────────────────────────────────────────────────────
const BASE_USDC = env.DEV_MODE
  ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e"   // Base Sepolia USDC
  : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";  // Base mainnet USDC

// ── Route builder ──────────────────────────────────────────────────────────
// amount is in atomic units (USDC has 6 decimals: $0.20 = 200000)
function gate(amount: string, description: string) {
  return {
    accepts: [
      {
        scheme:  "exact",
        payTo:   env.OPERATOR_BASE_ADDRESS,
        price:   { asset: BASE_USDC, amount },
        network: BASE_NETWORK,
      },
    ],
    description,
    mimeType: "application/json",
  };
}

// ── Routes config ──────────────────────────────────────────────────────────
export const routes: RoutesConfig = {
  "/api/vpn/hour":  gate("200000",   "Anonymous WireGuard VPN — 1-hour pass"),
  "/api/vpn/day":   gate("790000",   "Anonymous WireGuard VPN — 24-hour pass"),
  "/api/vpn/week":  gate("2990000",  "Anonymous WireGuard VPN — 7-day pass"),
  "/api/vpn/month": gate("7990000",  "Anonymous WireGuard VPN — 30-day pass"),
  "/api/vps/hour":  gate("250000",   "Ephemeral VPS — 1-hour pass"),
  "/api/vps/day":   gate("990000",   "Ephemeral VPS — 24-hour pass"),
  "/api/vps/week":  gate("3990000",  "Ephemeral VPS — 7-day pass"),
};

// ── Resource server ────────────────────────────────────────────────────────
// On testnet the x402.org facilitator is the right default; on mainnet it is not
// a supported production path, so an operator who leaves FACILITATOR_URL unset
// still gets a sane choice for whichever network DEV_MODE selects.
const X402ORG = "https://x402.org/facilitator";
const facilitatorUrl = env.DEV_MODE ? X402ORG : env.FACILITATOR_URL;

if (!env.DEV_MODE && facilitatorUrl === X402ORG) {
  throw new Error(
    "FACILITATOR_URL is set to the x402.org facilitator on Base mainnet. That is " +
    "a testnet/quickstart service — payments may verify and never settle. Use a " +
    "production facilitator (facilitator.payai.network, api.solvador.com, " +
    "corbits.dev) or self-host.",
  );
}

const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });
const server      = new x402ResourceServer(facilitator)
  .register("eip155:*", new ExactEvmScheme());

// syncFacilitatorOnStart must stay true (the SDK default). It is the startup
// fetch that tells the server which scheme/network pairs the facilitator settles.
// This was previously false — "boots fast, validates lazily" — but there is no
// lazy path: without that list every payment is rejected with "Facilitator does
// not support exact on eip155:8453". The service booted, served correct-looking
// 402 challenges, and 500'd on any real payment attempt.
export const x402Gate = paymentMiddleware(routes, server, undefined, undefined, true);
