// Aggregate all providers; return best net route + ranked comparison.
import { PROVIDERS, type ProviderQuote } from "./providers.js";
import type { EvmChain } from "./types.js";

export async function aggregate(amountUSDC: number, chain: EvmChain, token = "usdc") {
  const maxEta = Number(process.env.MAX_BRIDGE_ETA_SECONDS ?? 300);
  const active = Object.values(PROVIDERS).filter((p): p is NonNullable<typeof p> => !!p && p.supports(chain, token));

  const quotes: ProviderQuote[] = [];
  await Promise.all(active.map(async (p) => {
    try { quotes.push(await p.quote(amountUSDC, chain, token)); } catch { /* skip failed provider */ }
  }));

  const eligible = quotes
    .filter((q) => q.etaSeconds <= maxEta && q.reliabilityScore >= 0.5)
    .sort((a, b) => b.amountOutUSDC - a.amountOutUSDC); // best net out first

  // TODO(devin): integrator fee already folded into each quote's amountOut by the adapter (or add here once).
  return { best: eligible[0] ?? null, ranked: eligible };
}
