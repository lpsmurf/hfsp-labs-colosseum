/**
 * Devnet wallet setup for Milestone 0.
 *
 * Generates (or loads) a devnet keypair, persists it to a GITIGNORED file
 * (.devnet-wallet.json), and tries to airdrop devnet SOL so the wallet can pay
 * for the subscribe + validate transactions.
 *
 * DEVNET ONLY. Never fund this key with real SOL. Never commit the keypair file.
 *
 * Run:  npm run wallet
 */
import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Connection, Keypair, LAMPORTS_PER_SOL, clusterApiUrl } from "@solana/web3.js";
import { utils } from "@coral-xyz/anchor";

const bs58 = utils.bytes.bs58;
const WALLET_PATH = resolve(__dirname, "..", ".devnet-wallet.json");
const RPC = process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet");
const MIN_SOL = 0.05;

function loadOrCreate(): Keypair {
  if (process.env.WALLET_SECRET_KEY) {
    console.log("Using WALLET_SECRET_KEY from env.");
    return Keypair.fromSecretKey(bs58.decode(process.env.WALLET_SECRET_KEY));
  }
  if (existsSync(WALLET_PATH)) {
    const secret = Uint8Array.from(JSON.parse(readFileSync(WALLET_PATH, "utf8")));
    console.log(`Loaded existing devnet wallet from ${WALLET_PATH}`);
    return Keypair.fromSecretKey(secret);
  }
  const kp = Keypair.generate();
  writeFileSync(WALLET_PATH, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`Generated new devnet wallet → ${WALLET_PATH} (gitignored)`);
  return kp;
}

async function main() {
  const kp = loadOrCreate();
  console.log("Public key:", kp.publicKey.toBase58());
  console.log("Base58 secret (for WALLET_SECRET_KEY, keep secret):", bs58.encode(kp.secretKey));

  const conn = new Connection(RPC, "confirmed");
  let sol = (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
  console.log(`Balance: ${sol} SOL (RPC: ${RPC})`);

  if (sol < MIN_SOL) {
    console.log("Balance low — requesting devnet airdrop (2 SOL)…");
    try {
      const sig = await conn.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
      sol = (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
      console.log(`Airdrop confirmed. New balance: ${sol} SOL`);
    } catch (e) {
      console.warn(
        `\nAirdrop failed (${(e as Error).message}). The public devnet faucet is rate-limited.\n` +
          `Fund this address manually, e.g.:\n` +
          `  - https://faucet.solana.com  (paste ${kp.publicKey.toBase58()})\n` +
          `  - solana airdrop 2 ${kp.publicKey.toBase58()} --url devnet\n`
      );
    }
  }

  if (sol >= MIN_SOL) console.log("\nWallet is funded and ready for `npm run m0`.");
  else console.log("\nWallet needs funding before `npm run m0` will work.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
