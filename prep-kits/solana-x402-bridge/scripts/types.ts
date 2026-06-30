// Shared contracts for the solana-x402-bridge skill.
// Devin: implement against these interfaces. Keep the skill client thin — no secrets here.

export type EvmChain = "polygon" | "gnosis" | "base" | "arbitrum";

export interface BridgeQuote {
  route: string;
  amountInUSDC: number;
  bridgeFeeUSDC: number;
  bridgeFeeBps: number;
  networkFeesUSDC: number;
  amountOutUSDC: number;
  etaSeconds: number;
  feeRecipient: string;
  relayer: string;
}

export interface SafetyResult {
  ok: boolean;
  failures: string[];      // human-readable reasons; empty when ok
  rpcSlotLag: number;
  usedRpc: string;
}

export interface BridgeResult {
  sourceTx: string;
  destTx: string;
  statusId: string;
  sourceExplorer: string;
  destExplorer: string;
}
