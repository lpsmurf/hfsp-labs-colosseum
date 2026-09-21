// usage:
//   tsx scripts/onramp.ts quote <fiat> <amount> <deliverChain>   # fiat -> USDC
//   tsx scripts/onramp.ts offramp <amountUSDC> <fiat>            # USDC -> fiat
// Onramper aggregates 20+ on/off-ramp providers; returns best ranked quote (fee disclosed).
async function quote(fiat: string, amount: number, deliverChain: string) {
  // TODO(devin): call Onramper API (ONRAMPER_API_KEY, signed). Return best provider quote + full fee.
  // Deliver USDC to Solana or directly to the destination EVM chain.
  throw new Error("TODO: implement Onramper onramp quote");
}
async function offramp(amountUSDC: number, fiat: string) {
  // TODO(devin): Onramper offramp quote (USDC -> fiat) for cashing out winnings.
  throw new Error("TODO: implement Onramper offramp quote");
}
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "quote") quote(rest[0], Number(rest[1]), rest[2]);
else if (cmd === "offramp") offramp(Number(rest[0]), rest[1]);
else console.log("usage: quote <fiat> <amount> <deliverChain> | offramp <amountUSDC> <fiat>");
