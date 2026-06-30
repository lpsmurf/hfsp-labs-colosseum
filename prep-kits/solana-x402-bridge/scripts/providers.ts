// Bridge provider adapters — 5 Solana -> EVM providers ranked by the aggregator.
// Spec for each: see PROVIDERS.md. Add a provider = add one adapter implementing BridgeProvider.
import type { BridgeQuote, BridgeResult, EvmChain } from "./types.js";

export interface ProviderQuote extends BridgeQuote {
  provider: string;
  reliabilityScore: number; // 0..1 — aggregator filters below 0.5
}

export interface BridgeProvider {
  name: string;
  supports(chain: EvmChain, token: string): boolean;
  quote(amountUSDC: number, chain: EvmChain, token: string): Promise<ProviderQuote>;
  execute(amountUSDC: number, chain: EvmChain, token: string): Promise<BridgeResult>;
  status(id: string): Promise<string>;
}

// Solana mainnet chain id used by deBridge etc.
export const SOLANA_DLN_CHAIN_ID = 7565164;

// 1. Circle CCTP — native 1:1 USDC, no slippage. DEFAULT BENCHMARK.
const cctp: BridgeProvider = {
  name: "cctp",
  supports: (_chain, token) => token.toLowerCase() === "usdc",
  async quote() { throw new Error("TODO(devin): CCTP — depositForBurn + Iris attestation; out ~= in - gas. See PROVIDERS.md #1"); },
  async execute() { throw new Error("TODO(devin): CCTP execute"); },
  async status() { throw new Error("TODO(devin): CCTP status via Iris messageHash"); },
};

// 2. Mayan Finance — Solana-native (Swift/MCTP/Wormhole). price-api.mayan.finance/v3/quote
const mayan: BridgeProvider = {
  name: "mayan",
  supports: () => true,
  async quote() { throw new Error("TODO(devin): Mayan v3 quote API; pick best route. See PROVIDERS.md #2"); },
  async execute() { throw new Error("TODO(devin): Mayan swapFromSolana via SDK"); },
  async status() { throw new Error("TODO(devin): Mayan tracking API"); },
};

// 3. deBridge DLN — fast intent-based. dln.debridge.finance/v1.0/dln/order/quote
const debridge: BridgeProvider = {
  name: "debridge",
  supports: () => true,
  async quote() { throw new Error("TODO(devin): deBridge DLN quote (srcChainId=7565164). See PROVIDERS.md #3"); },
  async execute() { throw new Error("TODO(devin): deBridge create-tx + sign on Solana"); },
  async status() { throw new Error("TODO(devin): deBridge order status"); },
};

// 4. Wormhole / Portal — canonical fallback; prefer CCTP route via Connect. @wormhole-foundation/sdk
const wormhole: BridgeProvider = {
  name: "wormhole",
  supports: () => true,
  async quote() { throw new Error("TODO(devin): Wormhole SDK route quote; higher eta for VAA. See PROVIDERS.md #4"); },
  async execute() { throw new Error("TODO(devin): Wormhole transfer + VAA + redeem"); },
  async status() { throw new Error("TODO(devin): Wormhole VAA/redeem status"); },
};

// 5. Allbridge Core — stablecoin pools. @allbridge/bridge-core-sdk
const allbridge: BridgeProvider = {
  name: "allbridge",
  supports: (_chain, token) => token.toLowerCase() === "usdc",
  async quote() { throw new Error("TODO(devin): Allbridge getAmountToBeReceived. See PROVIDERS.md #5"); },
  async execute() { throw new Error("TODO(devin): Allbridge send + sign on Solana"); },
  async status() { throw new Error("TODO(devin): Allbridge status by tx"); },
};

// Aggregator pool — exactly 5 external bridge providers.
export const PROVIDERS: Record<string, BridgeProvider> = {
  cctp, mayan, debridge, wormhole, allbridge,
};

// Optional 6th: HFSP x402 relayer (generalized gnosis-card-x402) — execution/fee layer,
// register here only if you also want it quoted as a route. It carries the integrator fee natively.
