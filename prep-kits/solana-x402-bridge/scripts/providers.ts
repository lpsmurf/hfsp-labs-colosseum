// Bridge/swap provider adapters — 5 Solana -> EVM providers. Spec: PROVIDERS.md.
// Same-asset bridge (USDC->USDC) AND cross-chain swap (SOL->ETH) supported where the
// provider allows. Eligibility is decided per-pair by supportsPair().
import { executeViaHfspRelayer, getHfspRelayerStatus, quoteViaHfspRelayer } from "./hfsp-relayer.js";
import type { BridgeQuote, BridgeResult, EvmChain, ExecutionTerms } from "./types.js";

export interface ProviderQuote extends BridgeQuote {
  provider: string;
  reliabilityScore: number; // 0..1 — aggregator filters below 0.5
}

export interface BridgeProvider {
  name: string;
  category?: "external" | "relayer";
  // supportsPair: can this provider move srcToken on Solana to destToken on destChain?
  supportsPair(srcToken: string, chain: EvmChain, destToken: string): boolean;
  quote(srcToken: string, amountIn: number, chain: EvmChain, destToken: string): Promise<ProviderQuote>;
  execute(srcToken: string, amountIn: number, chain: EvmChain, destToken: string, terms?: ExecutionTerms): Promise<BridgeResult>;
  status(id: string): Promise<string>;
  /** False when quoting works but execution would fail for missing configuration. */
  executionReady?(): boolean;
}

export const SOLANA_DLN_CHAIN_ID = 7565164;
const isStable = (t: string) => ["usdc", "usdt"].includes(t.toLowerCase());
const sameAsset = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// 1. Circle CCTP — USDC->USDC only, native 1:1, no slippage. DEFAULT BENCHMARK.
const cctp: BridgeProvider = {
  name: "cctp",
  category: "external",
  supportsPair: (s, _c, d) => s.toLowerCase() === "usdc" && d.toLowerCase() === "usdc",
  async quote() { throw new Error("TODO(devin): CCTP burn/mint; impact=0. PROVIDERS.md #1"); },
  async execute() { throw new Error("TODO(devin): CCTP execute"); },
  async status() { throw new Error("TODO(devin): CCTP Iris status"); },
};

// 2. Mayan — ANY token -> ANY token (cross-chain swap). Best for SOL->ETH. price-api.mayan.finance/v3/quote
const mayan: BridgeProvider = {
  name: "mayan",
  category: "external",
  supportsPair: () => true, // any->any
  async quote() { throw new Error("TODO(devin): Mayan v3 quote (any->any); include priceImpact + minOut. PROVIDERS.md #2"); },
  async execute() { throw new Error("TODO(devin): Mayan swapFromSolana"); },
  async status() { throw new Error("TODO(devin): Mayan tracking"); },
};

// 3. deBridge DLN — ANY token -> ANY token (intent market). Supports SOL->ETH.
const debridge: BridgeProvider = {
  name: "debridge",
  category: "external",
  supportsPair: () => true, // any->any
  async quote() { throw new Error("TODO(devin): deBridge DLN quote (srcChainId=7565164); include impact. PROVIDERS.md #3"); },
  async execute() { throw new Error("TODO(devin): deBridge create-tx + sign"); },
  async status() { throw new Error("TODO(devin): deBridge order status"); },
};

// 4. Wormhole/Portal — same-asset bridge + CCTP route. SOL->ETH only via added swap legs (treat as limited).
const wormhole: BridgeProvider = {
  name: "wormhole",
  category: "external",
  supportsPair: (s, _c, d) => sameAsset(s, d) || (s.toLowerCase() === "usdc" && d.toLowerCase() === "usdc"),
  async quote() { throw new Error("TODO(devin): Wormhole SDK route; higher eta for VAA. PROVIDERS.md #4"); },
  async execute() { throw new Error("TODO(devin): Wormhole transfer + VAA + redeem"); },
  async status() { throw new Error("TODO(devin): Wormhole VAA status"); },
};

// 5. Allbridge Core — stablecoin pools only (USDC/USDT). No SOL->ETH.
const allbridge: BridgeProvider = {
  name: "allbridge",
  category: "external",
  supportsPair: (s, _c, d) => isStable(s) && isStable(d),
  async quote() { throw new Error("TODO(devin): Allbridge getAmountToBeReceived. PROVIDERS.md #5"); },
  async execute() { throw new Error("TODO(devin): Allbridge send + sign"); },
  async status() { throw new Error("TODO(devin): Allbridge status"); },
};

// Optional HFSP route — keeps execution/fee logic in the relayer while external routes
// remain the judge-facing comparison set.
const hfsp: BridgeProvider = {
  name: "hfsp",
  category: "relayer",
  // The relayer only accepts USDC in (the quote/execute requests carry no srcToken).
  supportsPair: (s) => Boolean(process.env.X402_RELAYER_URL) && s.toLowerCase() === "usdc",
  async quote(srcToken, amountIn, chain, destToken) {
    const quote = await quoteViaHfspRelayer(srcToken, amountIn, chain, destToken);
    return {
      ...quote,
      provider: "hfsp",
      reliabilityScore: 0.9,
    };
  },
  execute: executeViaHfspRelayer,
  // Quoting needs only the relayer URL; execution also needs the payment and recipient.
  executionReady: () => Boolean(process.env.X402_RELAYER_URL && process.env.HFSP_RECIPIENT_ADDRESS && process.env.X402_PAYMENT_SIGNATURE),
  status: getHfspRelayerStatus,
};

// Aggregator pool — 5 external providers plus an optional relayer route.
// SOL->ETH external eligible set resolves to: mayan, debridge.
export const PROVIDERS: Record<string, BridgeProvider> = {
  cctp, mayan, debridge, wormhole, allbridge,
  hfsp,
};

export function getExternalProviders() {
  return Object.values(PROVIDERS).filter((provider) => provider.category !== "relayer");
}
