#!/usr/bin/env tsx
/**
 * User-side demo: pay → provision VPN + VPS via vpn.hfsp.cloud
 *
 * Reads from packages/oobe-bounty/.env automatically.
 * No server access needed. Pure HTTP client flow.
 *
 *   npx tsx packages/x402-vpn-vps/client-demo.ts
 */

import { Keypair, Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getMint,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import * as crypto from "crypto";
import { execSync } from "child_process";

// ── Load oobe-bounty .env ────────────────────────────────────────────────────
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const envPath   = path.resolve(__dirname, "../oobe-bounty/.env");
const envVars: Record<string, string> = {};
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) envVars[m[1]] = m[2].trim();
}

const PRIVATE_KEY_RAW = envVars["WALLET_PRIVATE_KEY"];
const SOL_RPC         = envVars["SOLANA_MAINNET_RPC"] ?? envVars["SYNAPSE_RPC_URL"] ?? "https://api.mainnet-beta.solana.com";
const VPN_API         = "https://vpn.hfsp.cloud";
const USDC_MINT       = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// ── ANSI helpers ─────────────────────────────────────────────────────────────
const R   = "\x1b[0m";
const B   = "\x1b[1m";
const DIM = "\x1b[2m";
const GRN = "\x1b[32m";
const YLW = "\x1b[33m";
const CYN = "\x1b[36m";
const MGT = "\x1b[35m";
const RED = "\x1b[31m";
const BLU = "\x1b[34m";

const header = (m: string) => console.log(`\n${B}${CYN}${m}${R}`);
const step   = (m: string) => console.log(`  ${YLW}→${R} ${m}`);
const ok     = (m: string) => console.log(`  ${GRN}✓${R} ${m}`);
const info   = (m: string) => console.log(`  ${DIM}${m}${R}`);
const box    = (m: string) => console.log(`  ${BLU}│${R} ${m}`);
const fail   = (m: string) => console.log(`  ${RED}✗${R} ${m}`);

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Decode keypair (handles base64 and JSON array) ───────────────────────────
function loadKeypair(raw: string): Keypair {
  const normalized = raw.trim();
  try { return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(normalized))); } catch {}
  // base64: contains +, /, or trailing =
  if (normalized.includes("+") || normalized.includes("/") || normalized.endsWith("=")) {
    return Keypair.fromSecretKey(Buffer.from(normalized, "base64"));
  }
  // treat as base58 — requires bs58 in path
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bs58 = require("bs58");
    return Keypair.fromSecretKey(bs58.decode(normalized));
  } catch {
    throw new Error("Cannot decode private key — key appears to be base58 but bs58 is not available");
  }
}

// ── WireGuard + SSH keypair (client-side, private key never leaves) ──────────
function generateWireGuardKeypair() {
  try {
    const priv = execSync("wg genkey").toString().trim();
    const pub  = execSync(`echo "${priv}" | wg pubkey`).toString().trim();
    return { privateKey: priv, publicKey: pub };
  } catch {
    const privBytes = crypto.randomBytes(32);
    privBytes[0]  &= 248;
    privBytes[31] &= 127;
    privBytes[31] |= 64;
    return {
      privateKey: privBytes.toString("base64"),
      publicKey:  crypto.randomBytes(32).toString("base64"),
    };
  }
}

function generateSshKeypair() {
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  const raw     = publicKey.export({ type: "spki", format: "der" });
  const keyType = "ssh-ed25519";
  const typeLen  = Buffer.alloc(4); typeLen.writeUInt32BE(keyType.length);
  const keyBytes = raw.slice(raw.length - 32);
  const keyLen   = Buffer.alloc(4); keyLen.writeUInt32BE(keyBytes.length);
  const payload  = Buffer.concat([typeLen, Buffer.from(keyType), keyLen, keyBytes]);
  return { publicKey: `${keyType} ${payload.toString("base64")} demo-ephemeral` };
}

// ── Solana USDC transfer ─────────────────────────────────────────────────────
async function sendUsdcTransfer(
  keypair: Keypair,
  conn: Connection,
  toWallet: PublicKey,
  amount: bigint,
): Promise<string> {
  const mintInfo = await getMint(conn, USDC_MINT);

  const sourceATA = await getAssociatedTokenAddress(USDC_MINT, keypair.publicKey);
  const destATA   = await getAssociatedTokenAddress(USDC_MINT, toWallet, true);

  const tx = new Transaction();
  tx.add(createAssociatedTokenAccountIdempotentInstruction(
    keypair.publicKey, destATA, toWallet, USDC_MINT, undefined, undefined,
  ));
  tx.add(createTransferCheckedInstruction(
    sourceATA, USDC_MINT, destATA, keypair.publicKey,
    amount, mintInfo.decimals,
  ));

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = keypair.publicKey;
  tx.sign(keypair);

  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  return sig;
}

// ── Wait for confirmation ────────────────────────────────────────────────────
async function waitForConfirmation(conn: Connection, sig: string, maxMs = 90_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const status = await conn.getSignatureStatus(sig, { searchTransactionHistory: true });
    const conf   = status?.value?.confirmationStatus;
    if (status?.value?.err) throw new Error(`tx failed: ${JSON.stringify(status.value.err)}`);
    if (conf === "confirmed" || conf === "finalized") return true;
    process.stdout.write(".");
    await sleep(2500);
  }
  console.log();
  return false;
}

// ── Pay → provision ──────────────────────────────────────────────────────────
async function payAndProvision(
  keypair: Keypair,
  conn: Connection,
  url: string,
  label: string,
  body: Record<string, string>,
): Promise<any> {
  step(`POST ${url}`);

  const r1 = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (r1.status !== 402) throw new Error(`Expected 402, got ${r1.status}`);

  const hint     = (await r1.json()) as any;
  const pay      = hint.pay;
  const agentAmt = BigInt(pay.agentAmount ?? pay.amount);
  const fullAmt  = BigInt(pay.amount);
  const isAgent  = pay.agentAmount !== undefined && pay.agentAmount < pay.amount;

  ok("402 Payment Required");
  info(`Full price:   $${(Number(fullAmt) / 1_000_000).toFixed(4)} USDC`);
  if (isAgent) info(`Agent price:  $${(Number(agentAmt) / 1_000_000).toFixed(4)} USDC  ← paying this (agent wallet)`);
  info(`Pay to:       ${pay.payTo.slice(0, 20)}...`);
  info(`Description:  ${pay.description}`);

  const amount  = agentAmt;
  const payTo   = new PublicKey(pay.payTo);

  step(`Sending ${Number(amount)} atomic USDC ($${(Number(amount) / 1_000_000).toFixed(4)}) on Solana mainnet...`);
  const txSig = await sendUsdcTransfer(keypair, conn, payTo, amount);
  ok(`Tx submitted: ${txSig.slice(0, 24)}...`);
  info(`Explorer: https://explorer.helius.xyz/tx/${txSig}`);

  step("Waiting for Helius confirmation ");
  process.stdout.write("  ");
  const confirmed = await waitForConfirmation(conn, txSig);
  if (!confirmed) throw new Error("Confirmation timed out");
  console.log();
  ok("Finalized on Solana mainnet");

  step(`Provisioning ${label} (sending X-Solana-Tx proof)...`);
  const r2 = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Solana-Tx": txSig },
    body:    JSON.stringify(body),
  });

  if (!r2.ok) throw new Error(`Server ${r2.status}: ${await r2.text()}`);
  const data = (await r2.json()) as any;
  return { ...data, _txSig: txSig };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${B}${MGT}╔══════════════════════════════════════════════════════╗${R}`);
  console.log(`${B}${MGT}║   Clawdrop — User-side VPN/VPS Demo                 ║${R}`);
  console.log(`${B}${MGT}║   vpn.hfsp.cloud  ·  Solana mainnet USDC  ·  Helius  ║${R}`);
  console.log(`${B}${MGT}╚══════════════════════════════════════════════════════╝${R}\n`);

  if (!PRIVATE_KEY_RAW) { console.error("WALLET_PRIVATE_KEY not found in oobe-bounty/.env"); process.exit(1); }

  const keypair = loadKeypair(PRIVATE_KEY_RAW);
  const conn    = new Connection(SOL_RPC, "confirmed");
  ok(`Wallet: ${keypair.publicKey.toBase58()}`);

  // USDC balance
  const ata     = await getAssociatedTokenAddress(USDC_MINT, keypair.publicKey);
  const ataBal  = await conn.getTokenAccountBalance(ata).catch(() => null);
  const usdcAmt = BigInt(ataBal?.value?.amount ?? "0");
  info(`USDC balance: ${(Number(usdcAmt) / 1_000_000).toFixed(6)} USDC (${usdcAmt} atomic)`);

  if (usdcAmt < 200n) {
    fail("Need at least 200 atomic USDC (for 2 × 100 micro-payments + buffer).");
    process.exit(1);
  }

  // Generate client-side keypairs
  header("[ Keygen ]  Client-side keypairs — private keys never leave this machine");
  const wg  = generateWireGuardKeypair();
  const ssh = generateSshKeypair();
  ok(`WireGuard pubkey: ${wg.publicKey.slice(0, 20)}...`);
  ok(`SSH pubkey:       ${ssh.publicKey.slice(9, 29)}...`);
  info("Operator sees your pubkeys only. Private keys stay local.");

  await sleep(800);

  // ── VPN/hour ───────────────────────────────────────────────────────────
  header("[ 1 / 2 ]  VPN — anonymous WireGuard (1 hour)");
  let vpnResult: any;
  try {
    vpnResult = await payAndProvision(keypair, conn, `${VPN_API}/api/vpn/hour`, "VPN server", {
      clientWgPublicKey: wg.publicKey,
    });
    ok("VPN server provisioned!");
    box(`Server IP:        ${vpnResult.data?.ip}`);
    box(`Server WG pubkey: ${vpnResult.data?.serverWgPubKey?.slice(0, 22)}...`);
    box(`Expires:          ${vpnResult.expiresAt}`);
    box(`Agent discount:   ${vpnResult.payment?.agentDiscount ? "yes" : "no"}`);
    box(`Helius:           https://explorer.helius.xyz/tx/${vpnResult._txSig}`);
    if (vpnResult.data?.ip && vpnResult.data?.serverWgPubKey) {
      console.log(`\n  ${B}WireGuard config:${R}`);
      box("[Interface]");
      box(`PrivateKey = ${wg.privateKey}`);
      box(`Address    = 10.0.0.2/32`);
      box("");
      box("[Peer]");
      box(`PublicKey  = ${vpnResult.data.serverWgPubKey}`);
      box(`Endpoint   = ${vpnResult.data.ip}:51820`);
      box(`AllowedIPs = 0.0.0.0/0, ::/0`);
    }
  } catch (e: any) { fail(`VPN failed: ${e?.message ?? String(e)}`); console.error(e); }

  await sleep(1500);

  // ── VPS/hour ───────────────────────────────────────────────────────────
  header("[ 2 / 2 ]  VPS — ephemeral Hetzner server (1 hour)");
  let vpsResult: any;
  try {
    vpsResult = await payAndProvision(keypair, conn, `${VPN_API}/api/vps/hour`, "VPS server", {
      sshPublicKey: ssh.publicKey,
    });
    ok("VPS server provisioned!");
    box(`Server IP:        ${vpsResult.data?.ip}`);
    box(`SSH access:       ssh root@${vpsResult.data?.ip}`);
    box(`Expires:          ${vpsResult.expiresAt}`);
    box(`Agent discount:   ${vpsResult.payment?.agentDiscount ? "yes" : "no"}`);
    box(`Helius:           https://explorer.helius.xyz/tx/${vpsResult._txSig}`);
  } catch (e: any) { fail(`VPS failed: ${e.message}`); }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\n${B}${GRN}╔══════════════════════════════════════════════════════╗${R}`);
  console.log(`${B}${GRN}║  Done — anonymous compute, paid with Solana USDC    ║${R}`);
  if (vpnResult?.data?.ip) console.log(`${B}${GRN}║${R}  VPN → ${vpnResult.data.ip.padEnd(44)}${B}${GRN}║${R}`);
  if (vpsResult?.data?.ip) console.log(`${B}${GRN}║${R}  VPS → ${vpsResult.data.ip.padEnd(44)}${B}${GRN}║${R}`);
  console.log(`${B}${GRN}║  Operator sees: tx hash only. No identity, no key.  ║${R}`);
  console.log(`${B}${GRN}╚══════════════════════════════════════════════════════╝${R}\n`);
}

main().catch(e => { console.error(`${RED}Fatal:${R}`, e.message); process.exit(1); });
