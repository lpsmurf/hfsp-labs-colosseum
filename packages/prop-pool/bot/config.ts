/** PropPool Telegram bot config. Devnet only. Bot never holds keys — all signing
 *  happens in the Mini App with the user's wallet. */
import "dotenv/config";
import { resolve } from "node:path";

export const PKG = resolve(__dirname, "..");

export interface BotConfig {
  token: string;
  rpcUrl: string;
  miniappUrl: string;
  stakeMint: string;
  storePath: string;
  watchIntervalMs: number;
}

export function loadConfig(): BotConfig {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN is not set. Create a bot with @BotFather, then put the token in .env " +
        "(see .env.example). The bot code is complete; it just needs a token to run."
    );
  }
  return {
    token,
    rpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
    // HTTPS URL where the Mini App is hosted (register it in BotFather /setmenubutton).
    miniappUrl: process.env.MINIAPP_URL ?? "https://example.com/miniapp",
    // Devnet stake mint (default: Circle devnet USDC). Configurable per demo.
    stakeMint: process.env.STAKE_MINT ?? "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr",
    storePath: process.env.BOT_STORE_PATH ?? resolve(PKG, ".bot-store.json"),
    watchIntervalMs: Number(process.env.BOT_WATCH_INTERVAL_SECONDS ?? 30) * 1000,
  };
}
