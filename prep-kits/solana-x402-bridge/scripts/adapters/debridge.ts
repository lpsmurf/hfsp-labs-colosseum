// deBridge (DLN — deBridge Liquidity Network) adapter.
// Fast intent-based liquidity network with native Solana <-> EVM support.
// ANY token -> ANY token (USDC->USDC bridge AND swaps like SOL->ETH).
// Quote API: GET https://dln.debridge.finance/v1.0/dln/order/quote  (public, no key).
import type { EvmChain, BridgeResult } from "../types.js";
import type { BridgeProvider, ProviderQuote } from "../providers.js";

const SOLANA_DLN_CHAIN_ID = 7565164;

const DST_CHAIN_ID: Record<EvmChain, number> = {
  polygon: 137, ethereum: 1, base: 8453, arbitrum: 42161, gnosis: 100,
};

// Token address resolution. Native sentinels per deBridge convention.
const SOL_NATIVE = "11111111111111111111111111111111"; // SystemProgram = native SOL
const EVM_NATIVE = "0x0000000000000000000000000000000000000000";

const SRC_TOKENS: Record<string, string> = {
  usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  sol:  SOL_NATIVE,
};

// Destination token addresses per chain. "usdc" = canonical bridged USDC (CCTP-style),
// "usdc.e" = the Polygon PoS bridged USDC.e that Polymarket uses.
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
  if (!a) throw new Error(`debridge: unsupported source token '${token}'`);
  return a;
}
function resolveDst(chain: EvmChain, token: string): string {
  const a = DST_TOKENS[chain]?.[token.toLowerCase()];
  if (!a) throw new Error(`debridge: unsupported dest token '${token}' on ${chain}`);
  return a;
}
function toAtomic(amount: number, token: string): string {
  const dec = SRC_DECIMALS[token.toLowerCase()] ?? 6;
  return BigInt(Math.round(amount * 10 ** dec)).toString();
}

export const debridge: BridgeProvider = {
  name: "debridge",
  supportsPair: () => true, // any -> any

  async quote(srcToken, amountIn, chain, destToken): Promise<ProviderQuote> {
    const dstChainId = DST_CHAIN_ID[chain];
    if (!dstChainId) throw new Error(`debridge: unsupported chain '${chain}'`);

    const params = new URLSearchParams({
      srcChainId: String(SOLANA_DLN_CHAIN_ID),
      srcChainTokenIn: resolveSrc(srcToken),
      srcChainTokenInAmount: toAtomic(amountIn, srcToken),
      dstChainId: String(dstChainId),
      dstChainTokenOut: resolveDst(chain, destToken),
      // false => srcChainTokenInAmount is the exact spend; operating expenses come OUT of the output.
      prependOperatingExpenses: "false",
    });

    const url = `https://dln.debridge.finance/v1.0/dln/order/quote?${params}`;
    const res = await fetch(url);
    const json: any = await res.json();
    if (!res.ok || json.error || !json.estimation) {
      throw new Error(`debridge quote failed: ${json.errorMessage ?? json.error ?? res.status}`);
    }

    const est = json.estimation;
    const dst = est.dstChainTokenOut;
    const destDec: number = dst.decimals ?? 6;
    const amountOut = Number(dst.recommendedAmount ?? dst.amount) / 10 ** destDec;

    const kind = srcToken.toLowerCase() === destToken.toLowerCase() ? "bridge" : "swap";

    // Fees: DLN protocol fee + taker margin are the provider fee. Operating expenses are network/gas.
    const costs: any[] = Array.isArray(est.costsDetails) ? est.costsDetails : [];
    const usdcAmt = (c: any) => Number(c?.payload?.feeAmount ?? 0) / 1e6;
    const protocolFee = Number(json.protocolFeeApproximateUsdValue ?? 0);
    const takerMargin = usdcAmt(costs.find((c) => c.type === "TakerMargin"));
    const bridgeFeeUSDC = protocolFee + takerMargin;
    const opExpense = usdcAmt(costs.find((c) => c.type === "EstimatedOperatingExpenses"));

    // Solana fixed protocol fee, paid in SOL (lamports). Disclosed as a network cost (rough USD).
    const solPriceUsd = Number(process.env.SOL_PRICE_USD ?? 150);
    const fixFeeUsd = (Number(json.fixFee ?? 0) / 1e9) * solPriceUsd;
    const networkFeesUSDC = opExpense + fixFeeUsd;

    const bridgeFeeBps = amountIn > 0 ? (bridgeFeeUSDC / amountIn) * 10000 : 0;

    // Same-asset transfers have no price impact; swaps take it from the reported usd impact.
    const priceImpactBps = kind === "bridge" ? 0 : Math.abs(Number(json.usdPriceImpact ?? 0)) * 100;

    const slippageBps = Number(process.env.DEFAULT_SLIPPAGE_BPS ?? 50);
    const minAmountOut = amountOut * (1 - slippageBps / 10000);
    const etaSeconds = Number(json.order?.approximateFulfillmentDelay ?? 30) + 20;

    return {
      kind,
      route: "deBridge DLN",
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
      etaSeconds,
      feeRecipient: process.env.INTEGRATOR_FEE_ACCOUNT ?? "HFSP",
      relayer: process.env.X402_RELAYER_URL ?? "https://bridge.clawdrop.live",
      provider: "debridge",
      reliabilityScore: 0.9,
    };
  },

  async execute(): Promise<BridgeResult> {
    throw new Error("debridge.execute not implemented in quote-only MVP — PROVIDERS.md #3 (create-tx + sign)");
  },
  async status(): Promise<string> {
    throw new Error("debridge.status not implemented in quote-only MVP — PROVIDERS.md #3");
  },
};
