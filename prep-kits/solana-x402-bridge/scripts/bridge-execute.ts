// usage: tsx scripts/bridge-execute.ts <srcToken> <amountIn> <destChain> <destToken>
// Aggregate -> safety preflight (both chains) -> route to best provider adapter or HFSP relayer.
import { preflight } from "./bridge-safety.js";
import { aggregate } from "./bridge-aggregator.js";
import { PROVIDERS } from "./providers.js";
import type { EvmChain } from "./types.js";

async function execute(srcToken: string, amountIn: number, chain: EvmChain, destToken: string) {
  const safety = await preflight(srcToken, amountIn, chain, destToken);
  if (!safety.ok) throw new Error("Safety preflight failed: " + safety.failures.join("; "));

  const { best, relayer } = await aggregate(srcToken, amountIn, chain, destToken);
  const preferRelayer = process.env.PREFER_HFSP_RELAYER === "1" || process.env.PREFER_HFSP_RELAYER === "true";
  const usableRelayer = relayer && PROVIDERS.hfsp.executionReady?.() !== false ? relayer : null;
  const selected = preferRelayer ? (usableRelayer ?? best) : (best ?? usableRelayer);
  if (!selected) throw new Error("No eligible route");

  // Carry the accepted quote's floor into execution; the provider must reject worse output.
  const provider = PROVIDERS[selected.provider];
  return provider.execute(srcToken, amountIn, chain, destToken, { minAmountOut: selected.minAmountOut });
}

const [srcToken, amountIn, chain, destToken] = process.argv.slice(2);
execute(srcToken, Number(amountIn), chain as EvmChain, destToken).then((r) => console.log(JSON.stringify(r, null, 2)));
