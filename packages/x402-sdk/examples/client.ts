/**
 * AI agent client — fetch wrapper that handles the 402 → pay → retry loop automatically.
 * The agent pays USDC on Solana and retries without any manual payment logic.
 */
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { X402Client } from "../src/client/index.js";

const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;
const HELIUS_RPC_URL    = process.env.HELIUS_RPC_URL;
if (!AGENT_PRIVATE_KEY) throw new Error("Set AGENT_PRIVATE_KEY (base58 secret key) in the environment");
if (!HELIUS_RPC_URL)    throw new Error("Set HELIUS_RPC_URL in the environment");

const wallet = Keypair.fromSecretKey(bs58.decode(AGENT_PRIVATE_KEY));

const client = new X402Client({
  wallet,
  rpcUrl: HELIUS_RPC_URL,
});

// Automatically pays $0.50 USDC when the server returns 402
const res  = await client.fetch("https://api.example.com/api/analyze", {
  method:  "POST",
  headers: { "Content-Type": "application/json" },
  body:    JSON.stringify({ input: "analyze this" }),
});

const data = await res.json();
console.log(data);
