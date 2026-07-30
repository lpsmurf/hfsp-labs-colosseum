/**
 * Shared x402 V2 resource-server construction.
 *
 * Every HFSP service that sells something over x402 should build its payment gate
 * from here rather than hand-rolling a 402. Hand-rolled gates are how we ended up
 * with six services that no standard `@x402/*` client could pay.
 */

import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { RoutesConfig, RouteConfig } from "@x402/core/server";
// PaymentOption lives in the http subpath, not server — the two overlap but are
// not interchangeable.
import type { PaymentOption } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { NETWORKS, USDC, isMainnet, usdc, type NetworkName } from "./networks.js";

/**
 * Facilitators we have verified as supporting mainnet settlement.
 *
 * `x402.org` is deliberately NOT in this list. The spec docs are explicit that it
 * is a testnet/quickstart facilitator and "not intended to be the default
 * production choice for mainnet routes" — pointing mainnet traffic at it is the
 * kind of thing that works right up until it doesn't.
 */
export const FACILITATORS = {
  /** Testnet + local development only. */
  x402org:  "https://x402.org/facilitator",
  /**
   * Default. Verified against its /supported endpoint on 2026-07-29 as serving
   * x402Version 2 `exact` on eip155:8453, eip155:84532,
   * solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp and solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1
   * — i.e. every network we sell on, from one facilitator. No API key required.
   */
  payai:    "https://facilitator.payai.network",
  /** V2 on Base, including the `upto` and `batch-settlement` schemes. */
  solvador: "https://api.solvador.com",
  /** Multi-network production facilitator, EVM + Solana. Endpoint unverified. */
  corbits:  "https://corbits.dev",
} as const;

/** Sensible default for anything selling on mainnet. */
export const DEFAULT_FACILITATOR = FACILITATORS.payai;

export interface ResourceServerOptions {
  /** Facilitator base URL. Use a `FACILITATORS` entry unless self-hosting. */
  facilitatorUrl: string;
  /**
   * Which chain families this server settles on. Registering a family it never
   * uses is harmless but pointless; omitting one it does use fails at request
   * time, not at boot.
   */
  families: Array<"evm" | "svm">;
  /**
   * Networks this server actually gates routes on. Used only for the mainnet
   * safety check below.
   */
  networks: NetworkName[];
}

/**
 * Build a configured x402 resource server.
 *
 * Throws at construction — not at first request — if a mainnet network is paired
 * with the testnet facilitator. Failing at boot is the point: a misconfigured
 * facilitator on mainnet means payments that appear to work and never settle.
 */
export function createResourceServer(opts: ResourceServerOptions): x402ResourceServer {
  const touchesMainnet = opts.networks.some(isMainnet);
  if (touchesMainnet && opts.facilitatorUrl === FACILITATORS.x402org) {
    throw new Error(
      "Refusing to use the x402.org facilitator for a mainnet route. It is a " +
      "testnet/quickstart service. Set FACILITATOR_URL to a production " +
      `facilitator — one of: ${Object.keys(FACILITATORS).filter(k => k !== "x402org").join(", ")}.`,
    );
  }

  const facilitator = new HTTPFacilitatorClient({ url: opts.facilitatorUrl });
  let server = new x402ResourceServer(facilitator);

  if (opts.families.includes("evm")) server = server.register("eip155:*", new ExactEvmScheme());
  if (opts.families.includes("svm")) server = server.register("solana:*", new ExactSvmScheme());

  return server;
}

export interface GateOptions {
  /** Price in whole dollars, e.g. 0.99. Converted to USDC atomic units. */
  price: number;
  /** Recipient address. Must match the network's address format. */
  payTo: string;
  /** Which network to settle on. */
  network: NetworkName;
  /** Human-readable description — surfaces in discovery and in the 402 body. */
  description: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
}

/**
 * Build a single-network route gate priced in USDC.
 *
 * Uses an explicit `{ asset, amount }` rather than a `"$0.99"` price string: the
 * string form depends on the chain having a configured default stablecoin, and
 * silently has no meaning on chains that don't.
 */
export function gate(opts: GateOptions): RouteConfig {
  return {
    accepts: [paymentOption(opts)],
    description: opts.description,
    mimeType: opts.mimeType ?? "application/json",
  };
}

/**
 * Build a route gate that accepts payment on several networks.
 *
 * The client picks whichever option it can satisfy — this is how one endpoint
 * serves both a Base wallet and a Solana wallet without separate URLs.
 */
export function multiGate(
  description: string,
  options: GateOptions[],
  mimeType = "application/json",
): RouteConfig {
  if (options.length === 0) throw new Error("multiGate requires at least one payment option");
  return {
    accepts: options.map(paymentOption),
    description,
    mimeType,
  };
}

function paymentOption(opts: GateOptions): PaymentOption {
  return {
    scheme:  "exact",
    payTo:   opts.payTo,
    price:   { asset: USDC[opts.network], amount: usdc(opts.price) },
    network: NETWORKS[opts.network],
    ...(opts.maxTimeoutSeconds ? { maxTimeoutSeconds: opts.maxTimeoutSeconds } : {}),
  };
}

/**
 * Build the Express payment middleware for a set of routes.
 *
 * `syncFacilitatorOnStart` defaults to false so a slow or briefly unreachable
 * facilitator cannot stop the service booting; validation happens on the first
 * paid request instead.
 */
export function buildGate(
  routes: RoutesConfig,
  server: x402ResourceServer,
  syncFacilitatorOnStart = false,
) {
  return paymentMiddleware(routes, server, undefined, undefined, syncFacilitatorOnStart);
}

export type { RoutesConfig, RouteConfig, PaymentOption };
