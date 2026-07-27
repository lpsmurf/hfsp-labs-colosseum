import "dotenv/config";

function required(key: string): string {
  const v = process.env[key];
  if (!v) { console.error(`Missing env var: ${key}`); process.exit(1); }
  return v;
}

export const config = {
  port:         process.env.PORT ?? "3015",
  nodeEnv:      process.env.NODE_ENV ?? "development",
  payTo:        required("PAYMENT_RECIPIENT_SOL"),
  heliusRpc:    required("HELIUS_RPC_URL"),
  // price per call in micro-USDC units (1 USDC = 1_000_000). Default aligns with .env.example.
  // Validate the environment variable contains only digits to avoid unclear BigInt errors.
  pricePerCall: (() => {
    const s = process.env.PRICE_PER_CALL ?? "5000";
    if (!/^[0-9]+$/.test(s)) {
      console.error(`Invalid PRICE_PER_CALL value: ${s} — must be an integer number of micro-USDC`);
      process.exit(1);
    }
    return BigInt(s);
  })(),
};
