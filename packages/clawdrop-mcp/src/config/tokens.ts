/**
 * Token Configuration for Clawdrop Payment Integration
 * Supported tokens: SOL, USDT, USDC, HERD
 */

export const SUPPORTED_TOKENS = {
  SOL: {
    symbol: "SOL",
    name: "Solana",
    mint: "So11111111111111111111111111111111111111112",
    decimals: 9,
    coingecko_id: "solana"
  },

  USDT: {
    symbol: "USDT",
    name: "USDT Token (Solana)",
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenEJw",
    decimals: 6,
    coingecko_id: "tether"
  },

  USDC: {
    symbol: "USDC",
    name: "USD Coin (Solana)",
    mint: "EPjFWaJy47gowzcQmoak4ThL6hvojtn2J7gDmtPEDuh",
    decimals: 6,
    coingecko_id: "usd-coin"
  },

  HERD: {
    symbol: "HERD",
    name: "Herd Protocol",
    mint: "6MX5VAf51UoLLuE3Shivje31baeoxUJNSgTNXYn8YX2R", // ✅ Correct address
    decimals: 6,
    coingecko_id: "herd-protocol",
    solscan_url: "https://solscan.io/token/6MX5VAf51UoLLuE3Shivje31baeoxUJNSgTNXYn8YX2R"
  }
};

export const CLAWDROP_CONFIG = {
  // Payment wallet (YOUR wallet address - to be configured in .env)
  WALLET_ADDRESS: process.env.CLAWDROP_WALLET_ADDRESS || "YOUR_SOLANA_WALLET_HERE",

  // Fee configuration
  JUPITER_FEE_PERCENT: 0.0035, // 0.35% - Jupiter swap fee (we keep this)
  FLAT_FEE_USD: 1, // $1 USD for small transactions
  FLAT_FEE_THRESHOLD_USD: 100, // Threshold: < $100 = flat fee, >= $100 = 0.35%

  // Jupiter API
  JUPITER_API_URL: "https://quote-api.jup.ag/v6",
  JUPITER_SWAP_API_URL: "https://api.jup.ag/v6",

  // Solana RPC (Helius)
  HELIUS_API_KEY: process.env.HELIUS_API_KEY || "YOUR_HELIUS_API_KEY_HERE",
  HELIUS_RPC_DEVNET: "https://devnet.helius-rpc.com/",
  HELIUS_RPC_MAINNET: "https://mainnet.helius-rpc.com/",

  // Network
  NETWORK: process.env.NETWORK || "devnet", // "devnet" or "mainnet"

  // Payment configuration
  MIN_PAYMENT_SOL: 0.01,
  MAX_SLIPPAGE_BPS: 500, // 5% max slippage for swaps
  PAYMENT_QUOTE_EXPIRY_SECONDS: 300 // 5 minutes
};

export function getTokenBySymbol(symbol: string) {
  return SUPPORTED_TOKENS[symbol as keyof typeof SUPPORTED_TOKENS];
}

export function getTokenMint(symbol: string): string {
  const token = getTokenBySymbol(symbol);
  if (!token) {
    throw new Error(`Unsupported token: ${symbol}`);
  }
  return token.mint;
}

export function getTokenDecimals(symbol: string): number {
  const token = getTokenBySymbol(symbol);
  if (!token) {
    throw new Error(`Unsupported token: ${symbol}`);
  }
  return token.decimals;
}

export function getSupportedTokenSymbols(): string[] {
  return Object.keys(SUPPORTED_TOKENS);
}
