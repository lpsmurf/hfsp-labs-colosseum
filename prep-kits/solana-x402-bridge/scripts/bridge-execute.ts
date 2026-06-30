// usage: tsx scripts/bridge-execute.ts <srcToken> <amountIn> <destChain> <destToken>
// Aggregate -> safety preflight (both chains) -> route to best provider -> poll status.
import "./env.js";
import { preflight, requoteGuard } from "./bridge-safety.js";
import { aggregate } from "./bridge-aggregator.js";
import { PROVIDERS } from "./providers.js";
import type { EvmChain } from "./types.js";

async function execute(srcToken: string, amountIn: number, chain: EvmChain, destToken: string) {
  // 1. Best route first, so safety can validate the chosen quote (incl. swap slippage).
  const { best } = await aggregate(srcToken, amountIn, chain, destToken);
  if (!best) throw new Error("No eligible route");

  // 2. Mandatory preflight (allowlist, caps, RPC health, swap slippage protection).
  const safety = await preflight(srcToken, amountIn, chain, destToken, best);
  if (!safety.ok) throw new Error("Safety preflight failed: " + safety.failures.join("; "));

  // 3. Re-quote right before execute; abort swaps that drifted below minAmountOut.
  const rq = await requoteGuard(srcToken, amountIn, chain, destToken, best);
  if (!rq.ok) throw new Error("Re-quote guard blocked execution: " + rq.reason);

  const provider = PROVIDERS[best.provider];
  // TODO(devin): pay relayer via x402 if routing through HFSP; else execute via provider adapter.
  //   When implementing execute(), pass best.minAmountOut + a short deadline so the floor is
  //   enforced at the provider/settlement layer (not just checked here).
  return provider.execute(srcToken, amountIn, chain, destToken);
}

const [srcToken, amountIn, chain, destToken] = process.argv.slice(2);
execute(srcToken, Number(amountIn), chain as EvmChain, destToken).then((r) => console.log(JSON.stringify(r, null, 2)));
