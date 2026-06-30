// Allbridge Core adapter — stablecoin (USDC/USDT) Solana <-> EVM pools.
// Uses the official @allbridge/bridge-core-sdk (getAmountToBeReceived). The SDK is
// imported LAZILY inside quote() so a load/network failure is isolated to this
// provider — the aggregator simply skips it (it catches throwing providers).
// NOTE: the SDK fetches pool data from Allbridge's Core API; if that host is
// unreachable, this adapter throws and is skipped (the other providers still work).
import type { EvmChain, BridgeResult } from "../types.js";
import type { BridgeProvider, ProviderQuote } from "../providers.js";

// Allbridge ChainSymbol per supported EVM chain. Gnosis is NOT supported by Allbridge Core.
const CHAIN_SYMBOL: Partial<Record<EvmChain, string>> = {
  polygon: "POL", ethereum: "ETH", base: "BAS", arbitrum: "ARB",
};

const isStable = (t: string) => ["usdc", "usdt"].includes(t.toLowerCase());

// Build the SDK node-url map from env (only chains we have RPCs for).
function nodeUrls(): Record<string, string> {
  const urls: Record<string, string> = {};
  if (process.env.SOLANA_RPC_URL) urls.SOL = process.env.SOLANA_RPC_URL;
  if (process.env.POLYGON_RPC_URL) urls.POL = process.env.POLYGON_RPC_URL;
  if (process.env.ETHEREUM_RPC_URL) urls.ETH = process.env.ETHEREUM_RPC_URL;
  if (process.env.BASE_RPC_URL) urls.BAS = process.env.BASE_RPC_URL;
  if (process.env.ARBITRUM_RPC_URL) urls.ARB = process.env.ARBITRUM_RPC_URL;
  return urls;
}

export const allbridge: BridgeProvider = {
  name: "allbridge",
  // Stablecoin pools only (USDC/USDT), and only on Allbridge-supported EVM chains.
  supportsPair: (s, c, d) => isStable(s) && isStable(d) && !!CHAIN_SYMBOL[c],

  async quote(srcToken, amountIn, chain, destToken): Promise<ProviderQuote> {
    const sym = CHAIN_SYMBOL[chain];
    if (!sym) throw new Error(`allbridge: chain '${chain}' not supported`);

    // Lazy import keeps a heavy/optional dep out of the module graph.
    const mod: any = await import("@allbridge/bridge-core-sdk");
    const sdk = new mod.AllbridgeCoreSdk(nodeUrls());

    // tokens() hits Allbridge's Core API — throws here if unreachable (-> aggregator skips).
    const tokens: any[] = await sdk.tokens();
    const eq = (a: string, b: string) => a?.toUpperCase() === b?.toUpperCase();
    const source = tokens.find((t) => t.chainSymbol === "SOL" && eq(t.symbol, srcToken));
    const dest = tokens.find((t) => t.chainSymbol === sym && eq(t.symbol, destToken));
    if (!source || !dest) throw new Error(`allbridge: no pool for ${srcToken} (SOL) -> ${destToken} (${sym})`);

    const amountOut = Number(await sdk.getAmountToBeReceived(String(amountIn), source, dest));
    if (!Number.isFinite(amountOut) || amountOut <= 0) throw new Error("allbridge: invalid quote");

    // Stablecoin pool transfer: net of pool + bridge fee, ~no price impact for balanced pools.
    const bridgeFeeUSDC = Math.max(0, amountIn - amountOut);
    const bridgeFeeBps = amountIn > 0 ? (bridgeFeeUSDC / amountIn) * 10000 : 0;
    const slippageBps = Number(process.env.DEFAULT_SLIPPAGE_BPS ?? 50);

    let etaSeconds = 120;
    try {
      const ms = await sdk.getAverageTransferTime(source, dest, mod.Messenger?.ALLBRIDGE);
      if (Number.isFinite(ms) && ms > 0) etaSeconds = Math.round(ms / 1000);
    } catch { /* fall back to default eta */ }

    return {
      kind: "bridge",
      route: "Allbridge Core",
      srcChain: "solana",
      srcToken,
      destChain: chain,
      destToken,
      amountIn,
      amountOut,
      bridgeFeeUSDC,
      bridgeFeeBps,
      networkFeesUSDC: 0, // gas paid separately in the native token
      priceImpactBps: 0,
      minAmountOut: amountOut * (1 - slippageBps / 10000),
      slippageBps,
      etaSeconds,
      feeRecipient: process.env.INTEGRATOR_FEE_ACCOUNT ?? "HFSP",
      relayer: process.env.X402_RELAYER_URL ?? "https://bridge.clawdrop.live",
      provider: "allbridge",
      reliabilityScore: 0.85,
    };
  },

  async execute(): Promise<BridgeResult> {
    throw new Error("allbridge.execute not implemented in quote-only MVP — PROVIDERS.md #5 (SDK send)");
  },
  async status(): Promise<string> {
    throw new Error("allbridge.status not implemented in quote-only MVP — PROVIDERS.md #5");
  },
};
