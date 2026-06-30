// fiat-onramp module — Onramper integration (the fiat aggregator analog of the
// bridge aggregator). Returns the best ranked quote across 20+ providers, fee
// always disclosed. Quote-first; no secrets in code (key via ONRAMPER_API_KEY).
//
// usage:
//   tsx scripts/onramp.ts quote <fiat> <amount> <deliverChain|cryptoId>   # fiat -> USDC  (buy)
//   tsx scripts/onramp.ts offramp <amountUSDC> <fiat> [fromChain]         # USDC -> fiat  (sell)
//
// Examples:
//   tsx scripts/onramp.ts quote USD 20 solana          # USD -> USDC on Solana
//   tsx scripts/onramp.ts quote EUR 50 usdce_polygon   # EUR -> USDC.e on Polygon (Polymarket leg)
//   tsx scripts/onramp.ts offramp 20 USD solana        # cash out 20 USDC on Solana -> USD
import "./env.js";

const BASE = process.env.ONRAMPER_API_BASE ?? "https://api.onramper.com";
const KEY = process.env.ONRAMPER_API_KEY ?? "";

// Map a chain name to the Onramper USDC asset id. A full id ("usdc_solana",
// "usdce_polygon", ...) passed directly is used as-is.
const CHAIN_ALIASES: Record<string, string> = {
  solana: "usdc_solana",
  polygon: "usdc_polygon",
  "polygon.e": "usdce_polygon", // USDC.e on Polygon — what Polymarket uses
  ethereum: "usdc_ethereum",
  base: "usdc_base",
  arbitrum: "usdc_arbitrum",
};

function cryptoId(chainOrId: string): string {
  if (chainOrId.includes("_")) return chainOrId.toLowerCase(); // already a full asset id
  const id = CHAIN_ALIASES[chainOrId.toLowerCase()];
  if (!id) throw new Error(`onramp: unknown chain '${chainOrId}' (use solana|polygon|base|arbitrum|ethereum or a full asset id like usdce_polygon)`);
  return id;
}

interface OnramperQuote {
  ramp: string;
  payout: number | null;
  rate: number | null;
  networkFee: number | null;
  transactionFee: number | null;
  paymentMethod: string;
  recommendations?: string[];
}

interface RankedQuote {
  provider: string;
  payout: number;          // amount received (crypto for buy, fiat for sell)
  rate: number;
  networkFee: number;
  transactionFee: number;
  totalFeeOnTop: number;   // networkFee + transactionFee, disclosed
  feePct: number;          // total fee as % of input amount
  paymentMethod: string;
  recommendations: string[];
}

async function fetchQuotes(source: string, dest: string, amount: number): Promise<OnramperQuote[]> {
  if (!KEY) throw new Error("ONRAMPER_API_KEY not set (put it in .env)");
  const url = `${BASE}/quotes/${source.toLowerCase()}/${dest.toLowerCase()}?amount=${amount}`;
  const res = await fetch(url, { headers: { Authorization: KEY } });
  const json: any = await res.json();
  if (!res.ok || json?.message?.length === 0 || json?.error) {
    throw new Error(`onramper quote failed: ${json.message ?? json.error ?? res.status}`);
  }
  return Array.isArray(json) ? json : (json.quotes ?? []);
}

// Normalize + rank: drop providers that couldn't quote (null payout), best payout first.
function rank(quotes: OnramperQuote[], amount: number): RankedQuote[] {
  return quotes
    .filter((q) => typeof q.payout === "number" && (q.payout as number) > 0)
    .map((q) => {
      const networkFee = Number(q.networkFee ?? 0);
      const transactionFee = Number(q.transactionFee ?? 0);
      const totalFeeOnTop = networkFee + transactionFee;
      return {
        provider: q.ramp,
        payout: q.payout as number,
        rate: Number(q.rate ?? 0),
        networkFee,
        transactionFee,
        totalFeeOnTop,
        feePct: amount > 0 ? (totalFeeOnTop / amount) * 100 : 0,
        paymentMethod: q.paymentMethod,
        recommendations: q.recommendations ?? [],
      };
    })
    .sort((a, b) => b.payout - a.payout);
}

export async function onrampQuote(fiat: string, amount: number, deliverChain: string) {
  const dest = cryptoId(deliverChain);
  const ranked = rank(await fetchQuotes(fiat, dest, amount), amount);
  return { best: ranked[0] ?? null, ranked, direction: "onramp" as const, source: fiat, dest, amount };
}

export async function offrampQuote(amountUSDC: number, fiat: string, fromChain = "solana") {
  const source = cryptoId(fromChain);
  const ranked = rank(await fetchQuotes(source, fiat, amountUSDC), amountUSDC);
  return { best: ranked[0] ?? null, ranked, direction: "offramp" as const, source, dest: fiat, amount: amountUSDC };
}

type QuoteReport = { best: RankedQuote | null; ranked: RankedQuote[]; source: string; dest: string; amount: number };

function print(label: string, unit: string, r: QuoteReport) {
  if (!r.best) { console.log(`No ${label} quote available for ${r.source} -> ${r.dest}.`); return; }
  const b = r.best;
  console.log(`BEST ${label}: ${r.amount} ${r.source.toUpperCase()} -> ${r.dest}`);
  console.log(JSON.stringify({
    provider: b.provider,
    payout: `${b.payout} ${unit}`,
    fee: `${b.totalFeeOnTop.toFixed(2)} (${b.feePct.toFixed(2)}%)  [network ${b.networkFee} + txn ${b.transactionFee}]`,
    paymentMethod: b.paymentMethod,
    labels: b.recommendations,
  }, null, 2));
  console.log("\nCOMPARISON (ranked by payout, fee disclosed):");
  for (const q of r.ranked)
    console.log(`  ${q.provider.padEnd(12)} payout=${q.payout} ${unit}  fee=${q.totalFeeOnTop.toFixed(2)} (${q.feePct.toFixed(2)}%)  via ${q.paymentMethod}`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "quote") {
  onrampQuote(rest[0], Number(rest[1]), rest[2]).then((r) => print("(onramp)", "USDC", r)).catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
} else if (cmd === "offramp") {
  offrampQuote(Number(rest[0]), rest[1], rest[2]).then((r) => print("(offramp)", rest[1].toUpperCase(), r)).catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
} else {
  console.log("usage: quote <fiat> <amount> <deliverChain|cryptoId> | offramp <amountUSDC> <fiat> [fromChain]");
}
