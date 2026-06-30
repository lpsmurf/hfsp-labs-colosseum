// Bridge provider adapters. Add a provider = add one object implementing BridgeProvider.
import type { BridgeQuote, BridgeResult, EvmChain } from "./types.js";

export interface ProviderQuote extends BridgeQuote {
  provider: string;
  reliabilityScore: number; // 0..1, used by aggregator filter
}

export interface BridgeProvider {
  name: string;
  supports(chain: EvmChain, token: string): boolean;
  quote(amountUSDC: number, chain: EvmChain, token: string): Promise<ProviderQuote>;
  execute(amountUSDC: number, chain: EvmChain, token: string): Promise<BridgeResult>;
  status(id: string): Promise<string>;
}

// TODO(devin): implement adapters. Start with CCTP + Mayan + HFSP (3 is enough to prove aggregation).
export const PROVIDERS: Partial<Record<string, BridgeProvider>> = {
  cctp:      undefined, // Circle CCTP — native 1:1 USDC, lowest cost, no slippage. DEFAULT BENCHMARK.
  mayan:     undefined, // Mayan Finance — Solana-native (Wormhole + Swift/MCTP)
  hfsp:      undefined, // our x402 relayer (generalize gnosis-card-x402); carries integrator fee natively
  debridge:  undefined, // deBridge DLN — fast intent-based
  wormhole:  undefined, // Portal token bridge — canonical fallback
  allbridge: undefined, // Allbridge — stablecoin Solana<->EVM
  lifi:      undefined, // LI.FI — meta-aggregator; useful as a sanity benchmark
};
