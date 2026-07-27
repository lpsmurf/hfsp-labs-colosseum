// Registry of supported EVM destinations. Print with: tsx scripts/evm-targets.ts
export const EVM_TARGETS = {
  polygon:  { chainId: 137,   finalitySeconds: 45, tokens: { USDC_E: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" }, note: "Polymarket uses USDC.e" },
  gnosis:   { chainId: 100,   finalitySeconds: 90, tokens: { USDC:   "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83" }, note: "live via gnosis-card-x402" },
  base:     { chainId: 8453,  finalitySeconds: 30, tokens: { USDC:   "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" } },
  arbitrum: { chainId: 42161, finalitySeconds: 30, tokens: { USDC:   "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" } },
} as const;

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(EVM_TARGETS, null, 2));
