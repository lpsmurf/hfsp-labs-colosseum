// usage: tsx scripts/bridge-quote.ts <amountUSDC> <destChain> <destToken=usdc>
// Calls the relayer /quote. MUST surface the fee breakdown. Read-only.
import type { BridgeQuote } from "./types.js";

async function quote(amount: number, chain: string, token = "usdc"): Promise<BridgeQuote> {
  // TODO(devin): GET `${X402_RELAYER_URL}/quote?amount=${amount}&chain=${chain}&token=${token}`
  // Relayer applies INTEGRATOR_FEE_BPS / INTEGRATOR_FEE_ACCOUNT. Return the disclosed breakdown.
  throw new Error("TODO: implement against relayer /quote (generalize gnosis-card-x402)");
}

const [amount, chain, token] = process.argv.slice(2);
quote(Number(amount), chain, token).then((q) => console.log(JSON.stringify(q, null, 2)));
