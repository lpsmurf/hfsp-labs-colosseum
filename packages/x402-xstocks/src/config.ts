import "dotenv/config";

function required(key: string): string {
  const v = process.env[key];
  if (!v) { console.error(`Missing env var: ${key}`); process.exit(1); }
  return v;
}

export const config = {
  port:               process.env.PORT ?? "3014",
  sumsubAppToken:     required("SUMSUB_APP_TOKEN"),
  sumsubSecretKey:    required("SUMSUB_SECRET_KEY"),
  sumsubWebhookSecret: process.env.SUMSUB_WEBHOOK_SECRET ?? "",
  sumsubLevelName:    process.env.SUMSUB_LEVEL_NAME ?? "id-and-liveness",
  backedApiKey:       process.env.BACKED_API_KEY ?? "",
  solanaRpc:          process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  nodeEnv:            process.env.NODE_ENV ?? "development",
};

if (config.sumsubAppToken.startsWith("sbx:") && config.nodeEnv === "production") {
  console.warn("[config] WARNING: SUMSUB_APP_TOKEN is a sandbox token (sbx:) but NODE_ENV=production — sandbox credentials must not be used in production.");
}

// Webhook signature verification must not be silently skippable in production.
if (!config.sumsubWebhookSecret && config.nodeEnv === "production") {
  console.error("[config] SUMSUB_WEBHOOK_SECRET must be set in production — webhook signature verification cannot be skipped.");
  process.exit(1);
}
