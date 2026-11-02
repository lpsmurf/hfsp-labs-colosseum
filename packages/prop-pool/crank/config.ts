/**
 * Settlement-crank configuration (env + defaults). Devnet only.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Keypair, clusterApiUrl } from "@solana/web3.js";
import { utils } from "@coral-xyz/anchor";

export const PKG = resolve(__dirname, "..");

export interface CrankConfig {
  rpcUrl: string;
  wallet: Keypair;
  pollIntervalMs: number;
  computeUnits: number;
  maxRetries: number;
  retryBaseMs: number;
  runOnce: boolean;
}

function loadWallet(): Keypair {
  if (process.env.CRANK_WALLET_SECRET_KEY) {
    return Keypair.fromSecretKey(utils.bytes.bs58.decode(process.env.CRANK_WALLET_SECRET_KEY));
  }
  const path = process.env.CRANK_WALLET_KEYPAIR ?? resolve(PKG, ".devnet-wallet.json");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

export function loadConfig(): CrankConfig {
  return {
    rpcUrl: process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet"),
    wallet: loadWallet(),
    pollIntervalMs: Number(process.env.CRANK_POLL_INTERVAL_SECONDS ?? 30) * 1000,
    computeUnits: Number(process.env.CRANK_COMPUTE_UNITS ?? 1_400_000),
    maxRetries: Number(process.env.CRANK_MAX_RETRIES ?? 3),
    retryBaseMs: Number(process.env.CRANK_RETRY_BASE_MS ?? 2000),
    runOnce: process.argv.includes("--once") || process.env.CRANK_RUN_ONCE === "1",
  };
}
