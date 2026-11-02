// Registry of supported EVM destinations. Print with: tsx scripts/evm-targets.ts
const RELAYER_URL = process.env.X402_RELAYER_URL ?? "https://bridge.clawdrop.live";

export const EVM_TARGETS = {
  polygon: {
    chainId: 137,
    finalitySeconds: 45,
    relayerEndpoint: `${RELAYER_URL}/api/bridge`,
    tokens: {
      USDC: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
      USDC_E: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    },
    note: "Polymarket uses USDC.e; relayer may settle native USDC first.",
  },
  gnosis: {
    chainId: 100,
    finalitySeconds: 90,
    relayerEndpoint: `${RELAYER_URL}/api/bridge`,
    tokens: {
      USDC: "0x2a22f9c3b484c3629090feed35f17ff8f88f76f0",
      USDC_E: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83",
    },
    note: "Live via gnosis-card-x402; native Circle USDC preferred.",
  },
  base: {
    chainId: 8453,
    finalitySeconds: 30,
    relayerEndpoint: `${RELAYER_URL}/api/bridge`,
    tokens: { USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  },
  arbitrum: {
    chainId: 42161,
    finalitySeconds: 30,
    relayerEndpoint: `${RELAYER_URL}/api/bridge`,
    tokens: { USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
  },
  ethereum: {
    chainId: 1,
    finalitySeconds: 60,
    relayerEndpoint: `${RELAYER_URL}/api/bridge`,
    tokens: { USDC: "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" },
  },
} as const;

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(EVM_TARGETS, null, 2));
