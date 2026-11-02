import "dotenv/config";

function required(key: string): string {
  const v = process.env[key];
  if (!v) { console.error(`Missing env var: ${key}`); process.exit(1); }
  return v;
}

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) { console.error(`Env ${key}="${raw}" is not a number`); process.exit(1); }
  return n;
}

function bigintMicro(key: string, fallback: string): bigint {
  const s = process.env[key] ?? fallback;
  if (!/^[0-9]+$/.test(s)) { console.error(`Invalid ${key}: ${s} — integer micro-USDC required`); process.exit(1); }
  return BigInt(s);
}

export const config = {
  port:    process.env.PORT ?? "3016",
  nodeEnv: process.env.NODE_ENV ?? "development",

  // x402
  payTo:        required("PAYMENT_RECIPIENT_SOL"),
  heliusRpc:    required("HELIUS_RPC_URL"),
  pricePerCall: bigintMicro("PRICE_PER_CALL", "5000"),

  // data sources
  gammaUrl:    process.env.GAMMA_API_URL ?? "https://gamma-api.polymarket.com",
  clobUrl:     process.env.CLOB_API_URL  ?? "https://clob.polymarket.com",
  oddsApiBase: process.env.ODDS_API_BASE ?? "https://api.oddspapi.io/v4",
  oddsApiKey:  process.env.ODDS_API_KEY  ?? "",
  // Preferred sharp bookmaker for fair value; falls back to any active book if absent.
  oddsBookmaker: process.env.ODDS_BOOKMAKER ?? "pinnacle",

  // universe + costs
  universe: {
    maxDaysToResolve: num("MAX_DAYS_TO_RESOLVE", 7),
    minLiquidityUsd:  num("MIN_LIQUIDITY_USD", 5000),
    maxSpread:        num("MAX_SPREAD", 0.04),
    minEdge:          num("MIN_EDGE", 0.03),
  },
  costs: {
    takerFee:     num("TAKER_FEE", 0),
    estSlippage:  num("EST_SLIPPAGE", 0.01),
    safetyMargin: num("SAFETY_MARGIN", 0.01),
  },

  // sizing
  risk: {
    bankrollUsd:    num("BANKROLL_USD", 1000),
    kellyFraction:  num("KELLY_FRACTION", 0.25),
    maxPositionPct: num("MAX_POSITION_PCT", 0.05),
  },
} as const;

/** Total cost subtracted from raw edge before a bet qualifies. */
export function totalCostBuffer(): number {
  return config.costs.takerFee + config.costs.estSlippage + config.costs.safetyMargin;
}
