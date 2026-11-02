import { defineConfig } from "vitest/config";

// The config module hard-requires x402 env vars at import time (correct for the
// server). Tests only exercise pure math, so inject harmless placeholders.
export default defineConfig({
  test: {
    env: {
      PAYMENT_RECIPIENT_SOL: "TestWallet1111111111111111111111111111111",
      HELIUS_RPC_URL:        "https://example.invalid",
    },
  },
});
