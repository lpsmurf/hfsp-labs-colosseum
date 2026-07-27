// Shared contracts for solana-x402-bridge. Generalized to ANY token (bridge or cross-chain swap).
// Devin: implement against these. Keep the skill client thin — no secrets here.

export type EvmChain = "polygon" | "gnosis" | "base" | "arbitrum" | "ethereum";

// A bridge is a same-asset transfer (USDC->USDC). A swap is cross-chain with a different
// destination token (SOL->ETH) and carries slippage/price impact.
export type TransferKind = "bridge" | "swap";

export interface BridgeQuote {
  kind: TransferKind;
  route: string;
  srcChain: "solana";
  srcToken: string;        // e.g. "USDC", "SOL"
  destChain: EvmChain;
  destToken: string;       // e.g. "USDC", "ETH"
  amountIn: number;        // in srcToken units
  amountOut: number;       // in destToken units (net of all fees + swap impact)
  bridgeFeeUSDC: number;
  bridgeFeeBps: number;
  networkFeesUSDC: number;
  priceImpactBps: number;  // 0 for same-asset bridges; >0 for swaps
  minAmountOut: number;    // amountOut after applying slippage tolerance
  slippageBps: number;
  etaSeconds: number;
  feeRecipient: string;
  relayer: string;
}

export interface SafetyResult {
  ok: boolean;
  failures: string[];
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
