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
  // $0.001 USDC per call — micro-USDC units (1 USDC = 1_000_000)
  pricePerCall: BigInt(process.env.PRICE_PER_CALL ?? "1000"),
};
