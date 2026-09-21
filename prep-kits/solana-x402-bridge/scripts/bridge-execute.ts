// usage: tsx scripts/bridge-execute.ts <srcToken> <amountIn> <destChain> <destToken>
// Aggregate -> safety preflight (both chains) -> route to best provider -> poll status.
import { preflight } from "./bridge-safety.js";
import { aggregate } from "./bridge-aggregator.js";
import { PROVIDERS } from "./providers.js";
import type { EvmChain } from "./types.js";

async function execute(srcToken: string, amountIn: number, chain: EvmChain, destToken: string) {
  const safety = await preflight(srcToken, amountIn, chain, destToken);
  if (!safety.ok) throw new Error("Safety preflight failed: " + safety.failures.join("; "));

  const { best } = await aggregate(srcToken, amountIn, chain, destToken);
  if (!best) throw new Error("No eligible route");

  const provider = PROVIDERS[best.provider];
  // TODO(devin): pay relayer via x402 if routing through HFSP; else execute via provider adapter.
  return provider.execute(srcToken, amountIn, chain, destToken);
}

const [srcToken, amountIn, chain, destToken] = process.argv.slice(2);
execute(srcToken, Number(amountIn), chain as EvmChain, destToken).then((r) => console.log(JSON.stringify(r, null, 2)));
