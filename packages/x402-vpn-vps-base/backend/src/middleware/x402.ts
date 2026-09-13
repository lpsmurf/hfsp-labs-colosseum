// x402 payment gate for Base, with Celo as an optional second rail.
// Each route has its price set here; the facilitator validates amount + recipient on-chain.
// No private keys. Payment goes directly to the configured recipients.
//
// Built on @hfsp/x402-common rather than hand-rolled requirements: the shared
// package owns asset addresses, EIP-712 domains, facilitator routing and the
// mainnet-facilitator safety check, which this file used to duplicate.
import {
  createResourceServer,
  buildGate,
  multiGate,
  FACILITATORS,
  type GateOptions,
  type NetworkName,
  type RoutesConfig,
} from "@hfsp/x402-common";
import env from "../config.js";

// DEV_MODE runs on testnets so real funds are never required during development.
const baseNetwork: NetworkName = env.DEV_MODE ? "baseSepolia" : "base";
const celoNetwork: NetworkName = env.DEV_MODE ? "celoSepolia" : "celo";

// Celo is opt-in: half-configured, it would advertise a payment the facilitator
// then refuses to settle.
const celoRecipient = env.CELO_PAYMENT_RECIPIENT && env.CELO_FACILITATOR_API_KEY
  ? env.CELO_PAYMENT_RECIPIENT
  : undefined;

/**
 * Payment options for one route, same dollar price on every rail.
 *
 * On Celo, USDC is listed before USDT: stock x402 clients (≥ 2.23) accept only
 * default assets unless the buyer opts in, and USDC is the Celo default. Celo
 * Sepolia has no USDT, so testnet offers USDC only.
 */
function options(price: number, description: string): GateOptions[] {
  return [
    { price, payTo: env.OPERATOR_BASE_ADDRESS, network: baseNetwork, description },
    ...(celoRecipient ? [
      { price, payTo: celoRecipient, network: celoNetwork, asset: "USDC" as const, description },
      ...(env.DEV_MODE ? [] : [{ price, payTo: celoRecipient, network: celoNetwork, asset: "USDT" as const, description }]),
    ] : []),
  ];
}

const route = (price: number, description: string) => multiGate(description, options(price, description));

// Prices in dollars (USDC/USDT have 6 decimals: $0.20 = 200000 atomic).
export const routes: RoutesConfig = {
  "/api/vpn/hour":  route(0.20, "Anonymous WireGuard VPN — 1-hour pass"),
  "/api/vpn/day":   route(0.79, "Anonymous WireGuard VPN — 24-hour pass"),
  "/api/vpn/week":  route(2.99, "Anonymous WireGuard VPN — 7-day pass"),
  "/api/vpn/month": route(7.99, "Anonymous WireGuard VPN — 30-day pass"),
  "/api/vps/hour":  route(0.25, "Ephemeral VPS — 1-hour pass"),
  "/api/vps/day":   route(0.99, "Ephemeral VPS — 24-hour pass"),
  "/api/vps/week":  route(3.99, "Ephemeral VPS — 7-day pass"),
};

export const enabledNetworks: NetworkName[] = celoRecipient ? [baseNetwork, celoNetwork] : [baseNetwork];

/** Runtime rail descriptors, shared with the discovery manifest. */
export const rails = {
  primary:         baseNetwork,
  celo:            celoRecipient ? celoNetwork : undefined,
  celoAssets:      (env.DEV_MODE ? ["USDC"] : ["USDC", "USDT"]) as Array<"USDC" | "USDT">,
  facilitator:     env.DEV_MODE ? FACILITATORS.x402org : env.FACILITATOR_URL,
  celoFacilitator: celoRecipient ? FACILITATORS[env.DEV_MODE ? "celoSepolia" : "celo"] : undefined,
};

// On testnet the x402.org facilitator is the right default; on mainnet
// createResourceServer refuses it, so a misconfigured FACILITATOR_URL fails at
// boot instead of producing payments that verify and never settle.
const server = createResourceServer({
  facilitatorUrl:    rails.facilitator,
  families:          ["evm"],
  networks:          enabledNetworks,
  extraFacilitators: celoRecipient
    ? [{ url: rails.celoFacilitator!, apiKey: env.CELO_FACILITATOR_API_KEY }]
    : [],
});

// syncFacilitatorOnStart stays true (buildGate's default). It is the startup
// fetch that tells the server which scheme/network pairs each facilitator
// settles; without it every payment is rejected at request time.
export const x402Gate = buildGate(routes, server);
