// Bridge/swap provider adapters — 5 Solana -> EVM providers. Spec: PROVIDERS.md.
// Same-asset bridge (USDC->USDC) AND cross-chain swap (SOL->ETH) supported where the
// provider allows. Eligibility is decided per-pair by supportsPair().
import type { BridgeQuote, BridgeResult, EvmChain } from "./types.js";

export interface ProviderQuote extends BridgeQuote {
  provider: string;
  reliabilityScore: number; // 0..1 — aggregator filters below 0.5
}

export interface BridgeProvider {
  name: string;
  // supportsPair: can this provider move srcToken on Solana to destToken on destChain?
  supportsPair(srcToken: string, chain: EvmChain, destToken: string): boolean;
  quote(srcToken: string, amountIn: number, chain: EvmChain, destToken: string): Promise<ProviderQuote>;
  execute(srcToken: string, amountIn: number, chain: EvmChain, destToken: string): Promise<BridgeResult>;
  status(id: string): Promise<string>;
}

export const SOLANA_DLN_CHAIN_ID = 7565164;
const isStable = (t: string) => ["usdc", "usdt"].includes(t.toLowerCase());
const sameAsset = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// 1. Circle CCTP — USDC->USDC only, native 1:1, no slippage. DEFAULT BENCHMARK.
const cctp: BridgeProvider = {
  name: "cctp",
  supportsPair: (s, _c, d) => s.toLowerCase() === "usdc" && d.toLowerCase() === "usdc",
  async quote() { throw new Error("TODO(devin): CCTP burn/mint; impact=0. PROVIDERS.md #1"); },
  async execute() { throw new Error("TODO(devin): CCTP execute"); },
  async status() { throw new Error("TODO(devin): CCTP Iris status"); },
};

// 2. Mayan — ANY token -> ANY token (cross-chain swap). Best for SOL->ETH. price-api.mayan.finance/v3/quote
const mayan: BridgeProvider = {
  name: "mayan",
  supportsPair: () => true, // any->any
  async quote() { throw new Error("TODO(devin): Mayan v3 quote (any->any); include priceImpact + minOut. PROVIDERS.md #2"); },
  async execute() { throw new Error("TODO(devin): Mayan swapFromSolana"); },
  async status() { throw new Error("TODO(devin): Mayan tracking"); },
};

// 3. deBridge DLN — ANY token -> ANY token (intent market). Supports SOL->ETH.
const debridge: BridgeProvider = {
  name: "debridge",
  supportsPair: () => true, // any->any
  async quote() { throw new Error("TODO(devin): deBridge DLN quote (srcChainId=7565164); include impact. PROVIDERS.md #3"); },
  async execute() { throw new Error("TODO(devin): deBridge create-tx + sign"); },
  async status() { throw new Error("TODO(devin): deBridge order status"); },
};

// 4. Wormhole/Portal — same-asset bridge + CCTP route. SOL->ETH only via added swap legs (treat as limited).
const wormhole: BridgeProvider = {
  name: "wormhole",
  supportsPair: (s, _c, d) => sameAsset(s, d) || (s.toLowerCase() === "usdc" && d.toLowerCase() === "usdc"),
  async quote() { throw new Error("TODO(devin): Wormhole SDK route; higher eta for VAA. PROVIDERS.md #4"); },
  async execute() { throw new Error("TODO(devin): Wormhole transfer + VAA + redeem"); },
  async status() { throw new Error("TODO(devin): Wormhole VAA status"); },
};

// 5. Allbridge Core — stablecoin pools only (USDC/USDT). No SOL->ETH.
const allbridge: BridgeProvider = {
  name: "allbridge",
  supportsPair: (s, _c, d) => isStable(s) && isStable(d),
  async quote() { throw new Error("TODO(devin): Allbridge getAmountToBeReceived. PROVIDERS.md #5"); },
  async execute() { throw new Error("TODO(devin): Allbridge send + sign"); },
  async status() { throw new Error("TODO(devin): Allbridge status"); },
};

// Aggregator pool — exactly 5 external providers.
// SOL->ETH eligible set resolves to: mayan, debridge (cctp/allbridge/wormhole filtered out).
export const PROVIDERS: Record<string, BridgeProvider> = {
  cctp, mayan, debridge, wormhole, allbridge,
};
