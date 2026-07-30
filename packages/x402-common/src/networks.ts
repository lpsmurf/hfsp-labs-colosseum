/**
 * CAIP-2 network identifiers and default assets.
 *
 * x402 V2 identifies networks with CAIP-2 (`namespace:reference`), not the V1
 * free-text names (`base-mainnet`, `solana-mainnet`). Those V1 strings are not
 * accepted by any V2 facilitator, so nothing outside this file should ever spell
 * a network out by hand.
 */

export const NETWORKS = {
  base:         "eip155:8453",
  baseSepolia:  "eip155:84532",
  ethereum:     "eip155:1",
  sepolia:      "eip155:11155111",
  // Solana CAIP-2 uses the first 32 chars of the genesis hash.
  solana:       "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  solanaDevnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
} as const;

export type NetworkName = keyof typeof NETWORKS;
export type NetworkId = (typeof NETWORKS)[NetworkName];

/** Canonical USDC contract/mint per network. */
export const USDC = {
  base:         "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  baseSepolia:  "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  ethereum:     "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  sepolia:      "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  solana:       "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  solanaDevnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
} as const satisfies Record<NetworkName, string>;

/**
 * EIP-712 domain of each EVM USDC contract.
 *
 * Required, not decorative. EVM settlement uses EIP-3009
 * (`transferWithAuthorization`), and the client cannot construct the signature
 * without the token's EIP-712 `name` and `version`. Omit them and the client
 * fails with "EIP-712 domain parameters (name, version) are required in payment
 * requirements" — the server looks healthy and every EVM payment is impossible.
 *
 * These are NOT guessable: Base mainnet USDC is "USD Coin" while Base Sepolia
 * USDC is "USDC". Values below were read from the contracts via `eth_call`
 * (`name()` / `version()`) on 2026-07-30, except Ethereum mainnet — public RPCs
 * refused the call, and we do not currently sell on that network. Verify before
 * enabling it.
 */
export const EIP712_DOMAIN: Partial<Record<NetworkName, { name: string; version: string }>> = {
  base:        { name: "USD Coin", version: "2" },
  baseSepolia: { name: "USDC",     version: "2" },
  sepolia:     { name: "USDC",     version: "2" },
  ethereum:    { name: "USD Coin", version: "2" }, // unverified — see above
};

/** True for networks where a mistake costs real money. */
export function isMainnet(network: NetworkName): boolean {
  return network === "base" || network === "ethereum" || network === "solana";
}

/** EVM networks settle via EIP-3009 and need the token's EIP-712 domain. */
export function isEvm(network: NetworkName): boolean {
  return NETWORKS[network].startsWith("eip155:");
}

/** USDC has 6 decimals on every network we support. */
const USDC_DECIMALS = 6;

/**
 * Convert a dollar amount to USDC atomic units.
 *
 * Prefer this over the `"$0.01"` price-string form: the string form resolves via
 * the chain's configured default stablecoin, which only exists on some chains,
 * whereas an explicit asset + atomic amount works everywhere.
 */
export function usdc(dollars: number): string {
  if (!Number.isFinite(dollars) || dollars < 0) {
    throw new Error(`Invalid USDC amount: ${dollars}`);
  }
  return Math.round(dollars * 10 ** USDC_DECIMALS).toString();
}

/** Inverse of `usdc()`, for logging and receipts. */
export function usdcToDollars(atomic: string | bigint): number {
  return Number(BigInt(atomic)) / 10 ** USDC_DECIMALS;
}
