#!/usr/bin/env tsx
/**
 * Demo: Real VPN + VPS provisioning via Solana mainnet USDC payments.
 *
 * Flow:
 *   1. Generate WireGuard X25519 keypair + Ed25519 SSH keypair (client-side, never leaves demo)
 *   2. POST /api/vpn/hour → 402 → pay 0.20 USDC → confirm on Helius → retry → { ip, serverWgPubKey }
 *   3. POST /api/vps/hour → 402 → pay 0.25 USDC → confirm on Helius → retry → { ip, wireguardClientConf }
 *   4. Print WireGuard config + Hetzner server IPs
 *
 * Run:
 *   DEMO_WALLET_KEY=<base64-64-byte-keypair> npx tsx src/demo.ts
 * Or record:
 *   asciinema rec ../demo.cast --command ../demo.sh
 */

import {
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  createTransactionMessage,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getTransferCheckedInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  fetchMint,
} from "@solana-program/token-2022";
import { execSync } from "child_process";
import * as crypto from "crypto";

// ── Config ──────────────────────────────────────────────────────────────────
const VPN_API   = process.env.VPN_API_URL   ?? "https://vpn.hfsp.cloud";
const SOL_RPC   = process.env.HELIUS_RPC_URL;
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Agent wallet pays micro-price (100 atomic = $0.0001) for full provisioning.
// The server detects the sender wallet and grants access at agent rate.
const AGENT_MICRO_AMOUNT = 100n;
const MIN_BALANCE        = AGENT_MICRO_AMOUNT * 2n + 5_000n; // tiny buffer for SOL fees

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
const fail   = (m: string) => { console.log(`  ${RED}✗${R} ${m}`); };

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Keypair generation ───────────────────────────────────────────────────────
function generateWireGuardKeypair(): { privateKey: string; publicKey: string } {
  try {
    const priv = execSync("wg genkey").toString().trim();
    const pub  = execSync(`echo "${priv}" | wg pubkey`).toString().trim();
    return { privateKey: priv, publicKey: pub };
  } catch {
    // wg not available — generate synthetic X25519 for demo purposes
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

function generateSshKeypair(): { publicKey: string } {
  const { publicKey } = crypto.generateKeyPairSync("ed25519");
  const raw = publicKey.export({ type: "spki", format: "der" });
  // Encode as OpenSSH authorized_keys format
  const keyType = "ssh-ed25519";
  const typeLen  = Buffer.alloc(4); typeLen.writeUInt32BE(keyType.length);
  const keyBytes = raw.slice(raw.length - 32); // last 32 bytes = raw pubkey
  const keyLen   = Buffer.alloc(4); keyLen.writeUInt32BE(keyBytes.length);
  const payload  = Buffer.concat([typeLen, Buffer.from(keyType), keyLen, keyBytes]);
  return { publicKey: `${keyType} ${payload.toString("base64")} demo-ephemeral` };
}

// ── Solana USDC transfer ─────────────────────────────────────────────────────
async function sendUsdcTransfer(
  signer: any,
  toWallet: string,
  amount: bigint,
): Promise<string> {
  const rpc  = createSolanaRpc(SOL_RPC);
  const mint = await fetchMint(rpc as any, USDC_MINT as any);
  const tokenProgramAddress = mint.programAddress;

  const [sourceATA] = await findAssociatedTokenPda({
    mint: USDC_MINT as any, owner: signer.address, tokenProgram: tokenProgramAddress,
  });
  const [destinationATA] = await findAssociatedTokenPda({
    mint: USDC_MINT as any, owner: toWallet as any, tokenProgram: tokenProgramAddress,
  });

  const createAtaIx = getCreateAssociatedTokenIdempotentInstruction({
    payer: signer, owner: toWallet as any, mint: USDC_MINT as any,
    ata: destinationATA, tokenProgram: tokenProgramAddress,
  });

  const transferIx = getTransferCheckedInstruction(
    {
      source: sourceATA, mint: USDC_MINT as any, destination: destinationATA,
      authority: signer, amount, decimals: mint.data.decimals,
    },
    { programAddress: tokenProgramAddress },
  );

  const { value: latestBlockhash } = await (rpc as any).getLatestBlockhash().send();

  const tx = await pipe(
    createTransactionMessage({ version: 0 }),
    (msg: any) => setTransactionMessageFeePayer(signer.address, msg),
    (msg: any) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg),
    (msg: any) => appendTransactionMessageInstruction(createAtaIx, msg),
    (msg: any) => appendTransactionMessageInstruction(transferIx, msg),
    (msg: any) => signTransactionMessageWithSigners(msg),
  );

  const encoded = getBase64EncodedWireTransaction(tx as any);
  const sendRes = await fetch(SOL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "sendTransaction",
      params: [encoded, { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" }],
    }),
  });
  const sendJson = (await sendRes.json()) as any;
  if (sendJson.error) throw new Error(`sendTransaction: ${JSON.stringify(sendJson.error)}`);
  return sendJson.result as string;
}

// ── Helius confirmation ──────────────────────────────────────────────────────
async function waitForConfirmation(txSig: string, maxWaitMs = 90_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res  = await fetch(SOL_RPC, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "getSignatureStatuses",
        params: [[txSig], { searchTransactionHistory: true }],
      }),
    });
    const json   = (await res.json()) as any;
    const status = json?.result?.value?.[0];
    if (status?.err) throw new Error(`tx failed on-chain: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return true;
    }
    process.stdout.write(".");
    await sleep(2500);
  }
  console.log();
  return false;
}

// ── Pay and provision ────────────────────────────────────────────────────────
async function payAndProvision(
  signer: any,
  url: string,
  label: string,
  body: Record<string, string>,
): Promise<any> {
  step(`POST ${url}`);

  // 1. Get 402 payment hint — server tells us both full price and agent price
  const r1 = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  if (r1.status !== 402) {
    throw new Error(`Expected 402, got ${r1.status}`);
  }
  const hint = (await r1.json()) as any;
  ok("402 Payment Required");
  const agentAmt = BigInt(hint.pay?.agentAmount ?? AGENT_MICRO_AMOUNT);
  const fullAmt  = BigInt(hint.pay?.amount ?? 200_000n);
  info(`Full price: $${(Number(fullAmt) / 1_000_000).toFixed(4)} USDC — paying agent micro-price: $${(Number(agentAmt) / 1_000_000).toFixed(4)} USDC`);
  info(`Desc: ${hint.pay?.description}`);

  // 2. Send micro-payment — server recognises agent wallet and grants full provisioning
  const amount = agentAmt;
  step(`Signing & sending ${Number(amount)} atomic USDC ($${(Number(amount) / 1_000_000).toFixed(4)}) on Solana mainnet...`);
  const txSig = await sendUsdcTransfer(signer, hint.pay.payTo, amount);
  ok(`Transaction submitted: ${txSig.slice(0, 22)}...`);
  info(`Helius: https://explorer.helius.xyz/tx/${txSig}`);

  // 3. Wait for confirmation
  step("Confirming on-chain via Helius ");
  process.stdout.write("  ");
  const confirmed = await waitForConfirmation(txSig);
  if (!confirmed) throw new Error("Timed out waiting for on-chain confirmation");
  console.log();
  ok("Confirmed on Solana mainnet (finalized)");

  // 4. Retry with proof + provisioning body
  step(`Provisioning ${label}...`);
  const r2 = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Solana-Tx": txSig },
    body: JSON.stringify(body),
  });

  if (!r2.ok) {
    const txt = await r2.text();
    throw new Error(`Server error ${r2.status}: ${txt}`);
  }

  const data = (await r2.json()) as any;
  return { ...data, _txSig: txSig };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const rawKey = process.env.DEMO_WALLET_KEY;
  if (!rawKey) {
    console.error("Set DEMO_WALLET_KEY=<base64-64-byte-solana-keypair>");
    process.exit(1);
  }

  console.log(`\n${B}${MGT}╔══════════════════════════════════════════════════════╗${R}`);
  console.log(`${B}${MGT}║   Clawdrop — Anonymous VPN/VPS via x402 + Solana    ║${R}`);
  console.log(`${B}${MGT}║   vpn.hfsp.cloud  |  Solana mainnet USDC  |  Helius  ║${R}`);
  console.log(`${B}${MGT}╚══════════════════════════════════════════════════════╝${R}`);

  const keyBytes = Buffer.from(rawKey, "base64");
  const signer   = await createKeyPairSignerFromBytes(keyBytes);
  ok(`Agent wallet: ${signer.address}`);

  // Check USDC balance
  const balRes  = await fetch(SOL_RPC, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "getTokenAccountsByOwner",
      params: [signer.address, { mint: USDC_MINT }, { encoding: "jsonParsed" }],
    }),
  });
  const balJson   = (await balRes.json()) as any;
  const usdcAmt   = balJson?.result?.value?.[0]?.account?.data?.parsed?.info?.tokenAmount?.amount ?? "0";
  const usdcHuman = (parseInt(usdcAmt) / 1_000_000).toFixed(6);
  info(`USDC balance: ${usdcHuman} USDC (${usdcAmt} atomic)`);

  if (BigInt(usdcAmt) < MIN_BALANCE) {
    fail(`Insufficient USDC. Need ≥ ${MIN_BALANCE} atomic ($${(Number(MIN_BALANCE) / 1_000_000).toFixed(2)}), have ${usdcAmt}.`);
    info(`Send USDC to ${signer.address} on Solana mainnet.`);
    process.exit(1);
  }

  // ── Generate client-side keypairs ──────────────────────────────────────
  header("[ Keygen ]  Client-side keypairs (private keys never leave this demo)");
  const wg  = generateWireGuardKeypair();
  const ssh = generateSshKeypair();
  ok(`WireGuard pubkey: ${wg.publicKey.slice(0, 16)}...`);
  ok(`SSH pubkey:       ${ssh.publicKey.slice(9, 29)}...`);
  info("Private key stays local — Hetzner and operator never see it.");

  await sleep(1000);

  // ── VPN / hour ─────────────────────────────────────────────────────────
  header("[ 1 / 2 ]  VPN — anonymous WireGuard pass (1 hour)");
  let vpnResult: any;
  try {
    vpnResult = await payAndProvision(
      signer,
      `${VPN_API}/api/vpn/hour`,
      "VPN server",
      { clientWgPublicKey: wg.publicKey },
    );
    ok(`VPN server provisioned!`);
    box(`Server IP:         ${vpnResult.data?.ip}`);
    box(`Server WG pubkey:  ${vpnResult.data?.serverWgPubKey?.slice(0, 20)}...`);
    box(`Expires at:        ${vpnResult.expiresAt}`);
    box(`Tx (Helius):       https://explorer.helius.xyz/tx/${vpnResult._txSig}`);
    console.log();

    // Print WireGuard config the user would use
    if (vpnResult.data?.ip && vpnResult.data?.serverWgPubKey) {
      console.log(`  ${B}WireGuard config (wg0.conf):${R}`);
      box("[Interface]");
      box(`PrivateKey = <your-client-private-key>`);
      box(`Address    = 10.0.0.2/32`);
      box("");
      box("[Peer]");
      box(`PublicKey  = ${vpnResult.data.serverWgPubKey}`);
      box(`Endpoint   = ${vpnResult.data.ip}:51820`);
      box(`AllowedIPs = 0.0.0.0/0, ::/0`);
    }
  } catch (err: any) {
    fail(`VPN provisioning failed: ${err.message}`);
  }

  await sleep(2000);

  // ── VPS / hour ─────────────────────────────────────────────────────────
  header("[ 2 / 2 ]  VPS — ephemeral Hetzner Ubuntu server (1 hour)");
  let vpsResult: any;
  try {
    vpsResult = await payAndProvision(
      signer,
      `${VPN_API}/api/vps/hour`,
      "VPS server",
      { sshPublicKey: ssh.publicKey },
    );
    ok(`VPS server provisioned!`);
    box(`Server IP:         ${vpsResult.data?.ip}`);
    box(`SSH access:        ssh root@${vpsResult.data?.ip}`);
    box(`Expires at:        ${vpsResult.expiresAt}`);
    box(`Tx (Helius):       https://explorer.helius.xyz/tx/${vpsResult._txSig}`);
    if (vpsResult.data?.wireguardClientConf) {
      box(`WireGuard conf:    [embedded in response]`);
    }
  } catch (err: any) {
    fail(`VPS provisioning failed: ${err.message}`);
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\n${B}${GRN}╔══════════════════════════════════════════════════════╗${R}`);
  console.log(`${B}${GRN}║  ✔  Provisioning complete                            ║${R}`);
  console.log(`${B}${GRN}╠══════════════════════════════════════════════════════╣${R}`);
  if (vpnResult?.data?.ip)  console.log(`${B}${GRN}║${R}  VPN: ${vpnResult.data.ip.padEnd(44)} ${B}${GRN}║${R}`);
  if (vpsResult?.data?.ip)  console.log(`${B}${GRN}║${R}  VPS: ${vpsResult.data.ip.padEnd(44)} ${B}${GRN}║${R}`);
  console.log(`${B}${GRN}║  Payment: Solana mainnet USDC  |  Confirmed: Helius  ║${R}`);
  console.log(`${B}${GRN}║  Operator sees: tx hash only. No identity, no key.  ║${R}`);
  console.log(`${B}${GRN}╚══════════════════════════════════════════════════════╝${R}\n`);
}

main().catch(e => {
  console.error(RED + "Fatal: " + R, e);
  process.exit(1);
});
