// usage: tsx scripts/bridge-execute.ts <amountUSDC> <destChain> <destToken=usdc>
// Quote -> safety preflight -> x402 pay -> relayer execute -> poll status.
import { preflight } from "./bridge-safety.js";

async function execute(amount: number, chain: string, token = "usdc") {
  const safety = await preflight(amount, chain);
  if (!safety.ok) throw new Error("Safety preflight failed: " + safety.failures.join("; "));
  // TODO(devin):
  // 1. pay relayer via x402 (USDC on Solana) — see packages/gnosis-card-x402 X-Payment flow
  // 2. POST `${X402_RELAYER_URL}/execute` with payment header + {amount, chain, token}
  // 3. poll `${X402_RELAYER_URL}/status/:id` until settled
  // 4. return BridgeResult with both explorer links
  throw new Error("TODO: implement execute (reuse gnosis-card-x402 settlement flow)");
}

const [amount, chain, token] = process.argv.slice(2);
execute(Number(amount), chain, token).then((r) => console.log(JSON.stringify(r, null, 2)));
