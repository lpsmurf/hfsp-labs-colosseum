#!/usr/bin/env tsx
/**
 * Marketing demo — simulates the full VPN+VPS payment and provisioning flow.
 * No real network calls. Run from a real terminal and record with asciinema.
 *
 *   asciinema rec demo.cast \
 *     --title "Clawdrop — Anonymous VPN/VPS via Solana USDC" \
 *     --command "npx tsx packages/x402-vpn-vps/marketing-demo.ts"
 */

// ── ANSI ──────────────────────────────────────────────────────────────────────
const R   = "\x1b[0m";
const B   = "\x1b[1m";
const DIM = "\x1b[2m";
const GRN = "\x1b[32m";
const YLW = "\x1b[33m";
const CYN = "\x1b[36m";
const MGT = "\x1b[35m";
const RED = "\x1b[31m";
const BLU = "\x1b[34m";
const WHT = "\x1b[97m";

const write = (s: string) => process.stdout.write(s);
const ln    = (s = "")    => console.log(s);

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function type(text: string, delay = 28) {
  for (const ch of text) { write(ch); await sleep(delay + Math.random() * 18); }
}

async function prompt(cmd: string) {
  write(`\n${GRN}❯${R} `);
  await type(cmd, 32);
  await sleep(220);
  ln();
}

async function spin(label: string, ms: number) {
  const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
  const end = Date.now() + ms;
  let i = 0;
  while (Date.now() < end) {
    write(`\r  ${CYN}${frames[i++ % frames.length]}${R}  ${DIM}${label}${R}`);
    await sleep(80);
  }
  write(`\r  ${GRN}✓${R}  ${label}                    \n`);
}

function ok  (m: string) { ln(`  ${GRN}✓${R}  ${m}`); }
function step (m: string) { ln(`  ${YLW}→${R}  ${m}`); }
function info (m: string) { ln(`  ${DIM}${m}${R}`); }
function box  (m: string) { ln(`  ${BLU}│${R}  ${m}`); }
function head (m: string) { ln(`\n${B}${CYN}${m}${R}`); }

// ── Fake data ─────────────────────────────────────────────────────────────────
const WALLET   = "FEuTewmn9RdwexQnhvkCq7VaXfpnQL9qsYrTrCgTtk5e";
const VPN_TX   = "2j5sjzWwX7fJRiTxQMGbYMwxe3RZBDRwycUHkrFKcW66RokShi88utggYvQTNVZ6LuzLcbyWcPwe2oweNsGijmsA";
const VPS_TX   = "4PuADCoodtyWY9RgSjVzc7Hga7o5wFumA6NaJMeUCD5Sixrg3hWc3mV8efq7THhsR9TMcRNZ1kwwqHaPX2BDK2DT";
const VPN_IP   = "46.224.25.111";
const VPS_IP   = "46.224.25.236";
const VPN_PUBKEY = "3v4++HxVQGi0EtnsrsL8ry6WJI0XZWwvyMPq42Cf5CU=";
const WG_PRIV    = "MGHwCAcde4RCnN0yiW4vCx9AmaYSnuFr+drOR9eraH8=";
const WG_PUB     = "IQ53iofS0pADg+7INtkENFX9oe2ZRh4lma7SOkCPuqY=";
const SSH_PUB    = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBm3rVP4wQ9k2XzLpNvTJfRsHcYeUdMqoG6nWzKbPsAd demo-ephemeral";
const EXPIRES_VPN = new Date(Date.now() + 3_600_000).toISOString();
const EXPIRES_VPS = new Date(Date.now() + 3_600_000 + 5000).toISOString();

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  process.stdout.write("\x1b[2J\x1b[H"); // clear screen
  await sleep(400);

  // ── Banner ──────────────────────────────────────────────────────────────────
  ln(`${B}${MGT}`);
  ln("  ╔══════════════════════════════════════════════════════════╗");
  ln("  ║                                                          ║");
  ln("  ║   Clawdrop  —  Anonymous VPN & VPS                      ║");
  ln("  ║   Pay with Solana USDC  ·  No account  ·  No identity   ║");
  ln("  ║   vpn.hfsp.cloud                                        ║");
  ln("  ║                                                          ║");
  ln("  ╚══════════════════════════════════════════════════════════╝");
  ln(`${R}`);
  await sleep(1200);

  // ── Step 0: load wallet ─────────────────────────────────────────────────────
  await prompt("npx tsx client-demo.ts");
  await sleep(300);

  ok(`Agent wallet loaded`);
  info(`Address: ${WALLET}`);
  await sleep(200);
  info(`USDC balance: 0.200190  (200,190 atomic)`);
  await sleep(800);

  // ── Step 1: keygen ──────────────────────────────────────────────────────────
  head("[ Keygen ]  Client-side keypairs — private keys never leave this machine");
  await sleep(400);

  step("Generating WireGuard X25519 keypair...");
  await sleep(500);
  ok(`WireGuard pubkey:  ${WG_PUB.slice(0, 22)}...`);

  step("Generating Ed25519 SSH keypair...");
  await sleep(400);
  ok(`SSH pubkey:        AAAAC3NzaC1lZDI1NTE5...`);

  await sleep(300);
  info("Operator receives pubkeys only. Private keys stay local — always.");
  await sleep(1200);

  // ── Step 2: VPN ─────────────────────────────────────────────────────────────
  head("[ 1 / 2 ]  VPN  —  anonymous WireGuard pass  (1 hour)");
  await sleep(500);

  step(`POST https://vpn.hfsp.cloud/api/vpn/hour`);
  await sleep(600);

  ok("402 Payment Required");
  info("Full price:    $0.2000 USDC");
  info(`Pay to:        ${WALLET.slice(0,20)}...`);
  info("Description:   Anonymous WireGuard VPN — 1-hour pass");
  await sleep(800);

  step("Signing & sending 100 atomic USDC ($0.0001) on Solana mainnet...");
  await sleep(1800);
  ok(`Tx submitted:  ${VPN_TX.slice(0, 24)}...`);
  info(`Explorer:      https://explorer.helius.xyz/tx/${VPN_TX.slice(0,20)}...`);
  await sleep(600);

  await spin("Waiting for on-chain confirmation via Helius", 3200);
  ok("Finalized on Solana mainnet");
  await sleep(600);

  step("Sending X-Solana-Tx proof  →  provisioning VPN server...");
  await spin("Allocating cloud server", 2800);

  ok(`${B}VPN server provisioned!${R}`);
  await sleep(200);
  box(`Server IP:        ${VPN_IP}`);
  box(`Server WG pubkey: ${VPN_PUBKEY.slice(0,22)}...`);
  box(`Region:           EU — Nuremberg`);
  box(`Expires:          ${EXPIRES_VPN}`);
  box(`Helius:           https://explorer.helius.xyz/tx/${VPN_TX.slice(0,20)}...`);

  await sleep(600);
  ln();
  ln(`  ${B}WireGuard config  (wg0.conf):${R}`);
  box("[Interface]");
  box(`PrivateKey = ${WG_PRIV}`);
  box("Address    = 10.0.0.2/32");
  box("DNS        = 1.1.1.1");
  box("");
  box("[Peer]");
  box(`PublicKey  = ${VPN_PUBKEY}`);
  box(`Endpoint   = ${VPN_IP}:51820`);
  box("AllowedIPs = 0.0.0.0/0, ::/0");
  await sleep(1800);

  // ── Step 3: VPS ─────────────────────────────────────────────────────────────
  head("[ 2 / 2 ]  VPS  —  ephemeral cloud server  (1 hour)");
  await sleep(500);

  step(`POST https://vpn.hfsp.cloud/api/vps/hour`);
  await sleep(600);

  ok("402 Payment Required");
  info("Full price:    $0.2500 USDC");
  info(`Pay to:        ${WALLET.slice(0,20)}...`);
  info("Description:   Ephemeral VPS — 1-hour pass");
  await sleep(800);

  step("Signing & sending 100 atomic USDC ($0.0001) on Solana mainnet...");
  await sleep(1800);
  ok(`Tx submitted:  ${VPS_TX.slice(0, 24)}...`);
  info(`Explorer:      https://explorer.helius.xyz/tx/${VPS_TX.slice(0,20)}...`);
  await sleep(600);

  await spin("Waiting for on-chain confirmation via Helius", 3200);
  ok("Finalized on Solana mainnet");
  await sleep(600);

  step("Sending X-Solana-Tx proof  →  provisioning VPS server...");
  await spin("Allocating cloud server", 3400);

  ok(`${B}VPS server provisioned!${R}`);
  await sleep(200);
  box(`Server IP:        ${VPS_IP}`);
  box(`SSH access:       ssh root@${VPS_IP}`);
  box(`Region:           EU — Nuremberg`);
  box(`Expires:          ${EXPIRES_VPS}`);
  box(`Helius:           https://explorer.helius.xyz/tx/${VPS_TX.slice(0,20)}...`);
  await sleep(1800);

  // ── Summary ──────────────────────────────────────────────────────────────────
  ln();
  ln(`${B}${GRN}  ╔══════════════════════════════════════════════════════════╗${R}`);
  ln(`${B}${GRN}  ║                                                          ║${R}`);
  ln(`${B}${GRN}  ║   ✔  Provisioning complete                               ║${R}`);
  ln(`${B}${GRN}  ║                                                          ║${R}`);
  ln(`${B}${GRN}  ╠══════════════════════════════════════════════════════════╣${R}`);
  ln(`${B}${GRN}  ║${R}   VPN  →  ${WHT}${VPN_IP}${R}   (WireGuard ready)          ${B}${GRN}║${R}`);
  ln(`${B}${GRN}  ║${R}   VPS  →  ${WHT}${VPS_IP}${R}   (ssh root@${VPS_IP})    ${B}${GRN}║${R}`);
  ln(`${B}${GRN}  ║                                                          ║${R}`);
  ln(`${B}${GRN}  ║   Payment:  Solana mainnet USDC  ·  Confirmed by Helius  ║${R}`);
  ln(`${B}${GRN}  ║   Identity: none.  Key: none.  Account: none.            ║${R}`);
  ln(`${B}${GRN}  ║                                                          ║${R}`);
  ln(`${B}${GRN}  ║   vpn.hfsp.cloud                                        ║${R}`);
  ln(`${B}${GRN}  ╚══════════════════════════════════════════════════════════╝${R}`);
  ln();

  await sleep(3000);
}

main().catch(e => { console.error(e); process.exit(1); });
