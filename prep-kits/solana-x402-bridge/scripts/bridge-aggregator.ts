// Aggregate providers for a bridge (USDC->USDC) OR cross-chain swap (e.g. SOL->ETH).
// Returns best net external route + ranked comparison, and surfaces the relayer separately.
import { PROVIDERS, getExternalProviders, type ProviderQuote } from "./providers.js";
import type { AggregatedQuoteResult, EvmChain } from "./types.js";

export async function aggregate(
  srcToken: string,
  amountIn: number,
  destChain: EvmChain,
  destToken: string,
): Promise<AggregatedQuoteResult<ProviderQuote>> {
  const maxEta = Number(process.env.MAX_BRIDGE_ETA_SECONDS ?? 300);
  const integratorFeeBps = Number(process.env.INTEGRATOR_FEE_BPS ?? 0);
  const active = getExternalProviders().filter((p) => p.supportsPair(srcToken, destChain, destToken));

  const quotes: ProviderQuote[] = [];
  await Promise.all(active.map(async (p) => {
    try { quotes.push(await p.quote(srcToken, amountIn, destChain, destToken)); } catch { /* skip failed */ }
  }));

  const eligible = quotes
    .filter((q) => q.etaSeconds <= maxEta && q.reliabilityScore >= 0.5)
    .sort((a, b) =>
      effectiveAmountOut(b, integratorFeeBps) - effectiveAmountOut(a, integratorFeeBps)
      || a.etaSeconds - b.etaSeconds);

  let relayer: ProviderQuote | null = null;
  if (PROVIDERS.hfsp?.supportsPair(srcToken, destChain, destToken)) {
    try {
      const quote = await PROVIDERS.hfsp.quote(srcToken, amountIn, destChain, destToken);
      relayer = quote.etaSeconds <= maxEta ? quote : null;
    } catch {
      relayer = null;
    }
  }

  return { best: eligible[0] ?? null, ranked: eligible, relayer };
}

function effectiveAmountOut(quote: ProviderQuote, integratorFeeBps: number) {
  return quote.amountOut * (1 - integratorFeeBps / 10_000);
}
