/**
 * PropPool end-to-end demo (live devnet).
 *
 * Runs the whole product lifecycle and narrates it with on-chain tx links:
 *   create parametric prop -> two friends stake opposite sides ->
 *   the crank settles it via a REAL txoracle::validate_stat CPI -> winner claims.
 *
 * Writes artifacts/demo-run.json for the submission walkthrough (DEMO.md).
 *
 * Run:  npm run demo:e2e
 * DEVNET ONLY. Needs a funded .devnet-wallet.json (~0.2 SOL).
 */
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction,
  sendAndConfirmTransaction, clusterApiUrl,
} from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  makeProvider, loadProgram as loadTxoracle, networkConfig,
  startGuestSession, subscribeFreeWorldCup, signAndActivate, createClient,
  getFixturesSnapshot, getScoresSnapshot, getStatValidation, epochDayFromMs, batchTimestamp,
} from "../src/txline/index";
import type { ScoresStatValidation, Scores } from "../src/txline/index";
import { settleProp, explorer } from "../crank/settle";
import { statLabel } from "../bot/labels";

const PKG = resolve(__dirname, "..");
const RPC = process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet");
const cfg = networkConfig("devnet");
const idl = JSON.parse(readFileSync(resolve(PKG, "idl/prop_pool.json"), "utf8"));
const CACHE = resolve(PKG, ".m0-cache.json");
const wallet = () => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(resolve(PKG, ".devnet-wallet.json"), "utf8"))));

const h = (s = "") => console.log(s);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function realValidation(connection: Connection, kp: Keypair): Promise<ScoresStatValidation> {
  let jwt: string, apiToken: string;
  try {
    const c = JSON.parse(readFileSync(CACHE, "utf8"));
    if (c.pubkey !== kp.publicKey.toBase58()) throw 0;
    ({ jwt, apiToken } = c);
  } catch {
    jwt = await startGuestSession(cfg.apiOrigin);
    const { txSig } = await subscribeFreeWorldCup(loadTxoracle(makeProvider(connection, new Wallet(kp)), "devnet"));
    apiToken = await signAndActivate(cfg.apiOrigin, jwt, txSig, [], kp.secretKey);
  }
  const client = createClient({ apiOrigin: cfg.apiOrigin, jwt, apiToken });
  for (const f of await getFixturesSnapshot(client)) {
    let scores: Scores[];
    try { scores = await getScoresSnapshot(client, f.FixtureId); } catch { continue; }
    const row = [...scores].reverse().find((s) => s.Stats && Object.keys(s.Stats).length > 0);
    if (row?.Stats) {
      const statKey = Number(Object.keys(row.Stats)[0]);
      const v = (await getStatValidation(client, { fixtureId: f.FixtureId, seq: row.Seq, statKey })) as ScoresStatValidation;
      (v as any)._label = `${f.Participant1} vs ${f.Participant2}`;
      return v;
    }
  }
  throw new Error("no anchored fixture stat available on devnet right now");
}

async function main() {
  h("╔══════════════════════════════════════════════════════════════╗");
  h("║  PropPool — end-to-end demo (Solana devnet, real TxLINE proof) ║");
  h("╚══════════════════════════════════════════════════════════════╝\n");

  const payer = wallet();
  const connection = new Connection(RPC, "confirmed");
  const program: any = new Program(idl, new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" }));

  h("① Fetching a real, on-chain-anchored match stat from TxLINE devnet…");
  const v = await realValidation(connection, payer);
  const match = (v as any)._label ?? `fixture ${v.summary.fixtureId}`;
  const value = v.statToProve.value;
  const epochDay = epochDayFromMs(batchTimestamp(v));
  const stat = statLabel(v.statToProve.key);
  const threshold = value - 1; // greaterThan => predicate TRUE => OVER wins
  h(`   Match: ${match}`);
  h(`   Stat:  ${stat} (key ${v.statToProve.key}) — anchored value = ${value}\n`);

  h("② Setting up a USDC test mint + two players (Alice=OVER, Bob=UNDER)…");
  const mint = await createMint(connection, payer, payer.publicKey, null, 6);
  const alice = payer;
  const bob = Keypair.generate();
  await sendAndConfirmTransaction(connection, new Transaction().add(
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: bob.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })), [payer]);
  const ataA = await getOrCreateAssociatedTokenAccount(connection, payer, mint, alice.publicKey);
  const ataB = await getOrCreateAssociatedTokenAccount(connection, payer, mint, bob.publicKey);
  await mintTo(connection, payer, mint, ataA.address, payer, 5_000_000);
  await mintTo(connection, payer, mint, ataB.address, payer, 5_000_000);
  h("   done.\n");

  const fixtureIdBN = new BN(v.summary.fixtureId);
  const nonce = new BN(Date.now());
  const [prop] = PublicKey.findProgramAddressSync(
    [Buffer.from("prop"), fixtureIdBN.toArrayLike(Buffer, "le", 8), alice.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)], program.programId);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), prop.toBuffer()], program.programId);
  const pos = (u: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("position"), prop.toBuffer(), u.toBuffer()], program.programId)[0];

  const now = Math.floor(Date.now() / 1000);
  h(`③ Alice creates a prop:  "${stat} OVER ${threshold}"  (stake in USDC)`);
  const createSig = await program.methods.createProp({
    nonce, fixtureId: fixtureIdBN, statKey: v.statToProve.key, period: v.statToProve.period,
    statKeyB: null, op: null, threshold, comparison: { greaterThan: {} },
    expectedEpochDay: epochDay, minDeposit: new BN(1_000_000),
    joinDeadline: new BN(now + 8), settleAfter: new BN(now + 8), creatorSide: true,
  }).accounts({
    prop, vault, creator: alice.publicKey, stakeMint: mint,
    systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID,
    rent: new PublicKey("SysvarRent111111111111111111111111111111111"),
  }).rpc();
  h(`   prop ${prop.toBase58()}\n   ${explorer(createSig)}\n`);

  h("④ Friends stake opposite sides:  Alice 1 USDC OVER, Bob 2 USDC UNDER");
  const joinA = await program.methods.join(true, new BN(1_000_000)).accounts({
    prop, vault, position: pos(alice.publicKey), user: alice.publicKey, userTokenAccount: ataA.address,
    systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID }).rpc();
  const joinB = await program.methods.join(false, new BN(2_000_000)).accounts({
    prop, vault, position: pos(bob.publicKey), user: bob.publicKey, userTokenAccount: ataB.address,
    systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID }).signers([bob]).rpc();
  const afterJoin = await program.account.prop.fetch(prop);
  h(`   pool: OVER ${Number(afterJoin.overStake) / 1e6} | UNDER ${Number(afterJoin.underStake) / 1e6} | total ${Number(afterJoin.totalPool) / 1e6} USDC\n`);

  const waitMs = (now + 10) * 1000 - Date.now();
  if (waitMs > 0) { h(`   (waiting ${Math.ceil(waitMs / 1000)}s for the settle window)\n`); await sleep(waitMs); }

  h("⑤ The crank settles it — CPI into txoracle::validate_stat (trustless proof)…");
  const { signature: settleSig } = await settleProp(program, connection, prop, afterJoin, v, 1_400_000);
  const settled = await program.account.prop.fetch(prop);
  const winner = settled.winningSide ? "OVER (Alice)" : "UNDER (Bob)";
  h(`   settled: ${winner} wins — TxLINE-proven\n   ${explorer(settleSig)}\n`);

  h("⑥ Winner claims the pool; loser gets nothing.");
  const beforeA = Number((await getAccount(connection, ataA.address)).amount);
  const claimSig = await program.methods.claim().accounts({
    prop, vault, position: pos(alice.publicKey), userTokenAccount: ataA.address, user: alice.publicKey, tokenProgram: TOKEN_PROGRAM_ID }).rpc();
  const afterA = Number((await getAccount(connection, ataA.address)).amount);
  const vaultBal = Number((await getAccount(connection, vault)).amount);
  h(`   Alice received ${(afterA - beforeA) / 1e6} USDC; vault now ${vaultBal / 1e6} USDC\n   ${explorer(claimSig)}\n`);

  h("── Result card (what the Telegram bot posts) ──────────────────────");
  h(`🏁 Settled — ${stat} over ${threshold}`);
  h(`   ${settled.winningSide ? "OVER wins ▲" : "UNDER wins ▼"}`);
  h(`   ✅ TxLINE-proven on-chain: ${prop.toBase58()}\n`);

  mkdirSync(resolve(PKG, "artifacts"), { recursive: true });
  const run = {
    generatedAt: new Date().toISOString(), network: "devnet",
    programId: program.programId.toBase58(), match, stat, statKey: v.statToProve.key,
    anchoredValue: value, prop: prop.toBase58(),
    predicate: `${stat} over ${threshold}`, winner,
    totalPool: Number(afterJoin.totalPool) / 1e6,
    txs: {
      create: explorer(createSig), joinOver: explorer(joinA), joinUnder: explorer(joinB),
      settle: explorer(settleSig), claim: explorer(claimSig),
    },
  };
  writeFileSync(resolve(PKG, "artifacts/demo-run.json"), JSON.stringify(run, null, 2));
  h(`Saved artifacts/demo-run.json`);
  h("\nDEMO COMPLETE ✅  create → stake → trustless settle (real CPI) → claim");
}

main().catch((e) => { console.error("\nDEMO FAILED:", e); process.exit(1); });
