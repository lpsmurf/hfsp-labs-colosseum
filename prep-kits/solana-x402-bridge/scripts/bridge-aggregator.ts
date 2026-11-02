// Aggregate providers for a bridge (USDC->USDC) OR cross-chain swap (e.g. SOL->ETH).
// Returns best net route + ranked comparison. Eligibility via each adapter's supports().
import { PROVIDERS, type ProviderQuote } from "./providers.js";
import type { EvmChain } from "./types.js";

export async function aggregate(
  srcToken: string,
  amountIn: number,
  destChain: EvmChain,
  destToken: string,
) {
  const maxEta = Number(process.env.MAX_BRIDGE_ETA_SECONDS ?? 300);
  const active = Object.values(PROVIDERS).filter((p) => p.supportsPair(srcToken, destChain, destToken));

  const quotes: ProviderQuote[] = [];
  await Promise.all(active.map(async (p) => {
    try { quotes.push(await p.quote(srcToken, amountIn, destChain, destToken)); } catch { /* skip failed */ }
  }));

  const eligible = quotes
    .filter((q) => q.etaSeconds <= maxEta && q.reliabilityScore >= 0.5)
    .sort((a, b) => b.amountOut - a.amountOut); // best net out (in destToken) first

  return { best: eligible[0] ?? null, ranked: eligible };
}
