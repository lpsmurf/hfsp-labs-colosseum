// Mayan Finance adapter. Solana-native cross-chain (Swift / MCTP / Wormhole routes).
// ANY token -> ANY token, so it handles USDC->USDC bridges AND swaps (e.g. SOL->ETH).
// Quote API: GET https://price-api.mayan.finance/v3/quote  (public; sdkVersion required for Swift v2).
import type { EvmChain, BridgeResult } from "../types.js";
import type { BridgeProvider, ProviderQuote } from "../providers.js";

// Mayan chain names match our EvmChain names; Solana source is "solana".
const SRC_TOKENS: Record<string, string> = {
  usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  sol:  "So11111111111111111111111111111111111111112", // wSOL mint represents native SOL
};
const EVM_NATIVE = "0x0000000000000000000000000000000000000000";

const DST_TOKENS: Record<EvmChain, Record<string, string>> = {
  polygon:  { usdc: "0x3c499c542cEF5E3811e1192ce70d8cc03d5c3359", "usdc.e": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", eth: EVM_NATIVE },
  ethereum: { usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", eth: EVM_NATIVE },
  base:     { usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", eth: EVM_NATIVE },
  arbitrum: { usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", eth: EVM_NATIVE },
  gnosis:   { usdc: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83" },
};

const SRC_DECIMALS: Record<string, number> = { usdc: 6, sol: 9 };

function resolveSrc(token: string): string {
  const a = SRC_TOKENS[token.toLowerCase()];
  if (!a) throw new Error(`mayan: unsupported source token '${token}'`);
  return a;
}
function resolveDst(chain: EvmChain, token: string): string {
  const a = DST_TOKENS[chain]?.[token.toLowerCase()];
  if (!a) throw new Error(`mayan: unsupported dest token '${token}' on ${chain}`);
  return a;
}
function toAtomic(amount: number, token: string): string {
  const dec = SRC_DECIMALS[token.toLowerCase()] ?? 6;
  return BigInt(Math.round(amount * 10 ** dec)).toString();
}

export const mayan: BridgeProvider = {
  name: "mayan",
  supportsPair: () => true, // any -> any

  async quote(srcToken, amountIn, chain, destToken): Promise<ProviderQuote> {
    const params = new URLSearchParams({
      amountIn64: toAtomic(amountIn, srcToken),
      fromToken: resolveSrc(srcToken),
      fromChain: "solana",
      toToken: resolveDst(chain, destToken),
      toChain: chain,
      slippageBps: "auto",
      gasDrop: "0",
      // enable all route protocols; sdkVersion >= 13.0.0 is required to receive Swift v2 routes
      swift: "true", mctp: "true", fastMctp: "true", wormhole: "true",
      referrerBps: String(process.env.MAYAN_REFERRER_BPS ?? 0),
      sdkVersion: "13_1_0",
    });
    if (process.env.MAYAN_REFERRER) params.set("referrer", process.env.MAYAN_REFERRER);

    const url = `https://price-api.mayan.finance/v3/quote?${params}`;
    const res = await fetch(url);
    const json: any = await res.json();
    const quotes: any[] = json?.quotes ?? [];
    if (!res.ok || json.code || quotes.length === 0) {
      throw new Error(`mayan quote failed: ${json.msg ?? json.code ?? res.status}`);
    }

    // Best route = highest expected output.
    const q = quotes.reduce((best, cur) =>
      Number(cur.expectedAmountOut) > Number(best.expectedAmountOut) ? cur : best);

    const kind = srcToken.toLowerCase() === destToken.toLowerCase() ? "bridge" : "swap";
    const amountOut = Number(q.expectedAmountOut);
    const minAmountOut = Number(q.minAmountOut ?? q.minReceived ?? amountOut);
    const slippageBps = Number(q.slippageBps ?? process.env.DEFAULT_SLIPPAGE_BPS ?? 50);

    // Provider fee (protocol + referrer), disclosed in USD.
    const bridgeFeeUSDC = Number(q.protocolFeeUsd ?? 0) + Number(q.referrerFeeUsd ?? 0);
    const bridgeFeeBps = (Number(q.protocolBps ?? 0) + Number(q.referrerBps ?? 0));

    // priceImpact is a fraction when present (null for clean stable routes).
    const priceImpactBps = kind === "bridge"
      ? 0
      : (q.priceImpact != null ? Math.abs(Number(q.priceImpact)) * 10000 : 0);

    // For same-asset USDC bridge, residual (in - out - providerFee) is the network/relayer cost.
    const networkFeesUSDC = kind === "bridge"
      ? Math.max(0, amountIn - amountOut - bridgeFeeUSDC)
      : Number(q.clientRelayerFeeSuccess ?? 0);

    return {
      kind,
      route: `Mayan ${q.type ?? ""}`.trim(),
      srcChain: "solana",
      srcToken,
      destChain: chain,
      destToken,
      amountIn,
      amountOut,
      bridgeFeeUSDC,
      bridgeFeeBps,
      networkFeesUSDC,
      priceImpactBps,
      minAmountOut,
      slippageBps,
      etaSeconds: Number(q.etaSeconds ?? 60),
      feeRecipient: process.env.INTEGRATOR_FEE_ACCOUNT ?? "HFSP",
      relayer: process.env.X402_RELAYER_URL ?? "https://bridge.clawdrop.live",
      provider: "mayan",
      reliabilityScore: 0.9,
    };
  },

  async execute(): Promise<BridgeResult> {
    throw new Error("mayan.execute not implemented in quote-only MVP — PROVIDERS.md #2 (swapFromSolana)");
  },
  async status(): Promise<string> {
    throw new Error("mayan.status not implemented in quote-only MVP — PROVIDERS.md #2");
  },
};
