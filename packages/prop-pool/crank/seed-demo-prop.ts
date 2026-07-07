/**
 * Seed a fresh OPEN prop (create_prop + two joins on opposite sides, NO settle)
 * so the crank can settle it unattended. Prints the prop pubkey.
 *
 * Run:  npx tsx crank/seed-demo-prop.ts
 * Then: npm run crank -- --once   (after ~20s, when settle_after has passed)
 *
 * DEVNET ONLY.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction,
  sendAndConfirmTransaction, clusterApiUrl,
} from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import {
  createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  makeProvider, loadProgram as loadTxoracle, networkConfig,
  startGuestSession, subscribeFreeWorldCup, signAndActivate, createClient,
  getFixturesSnapshot, getScoresSnapshot, getStatValidation, epochDayFromMs, batchTimestamp,
} from "../src/txline/index";
import type { ScoresStatValidation, Scores } from "../src/txline/index";

const PKG = resolve(__dirname, "..");
const RPC = process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet");
const cfg = networkConfig("devnet");
const idl = JSON.parse(readFileSync(resolve(PKG, "idl/prop_pool.json"), "utf8"));
const CACHE = resolve(PKG, ".m0-cache.json");
const SETTLE_DELAY_S = Number(process.env.SEED_SETTLE_DELAY_S ?? 18);

function wallet(): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(resolve(PKG, ".devnet-wallet.json"), "utf8"))));
}

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
      return (await getStatValidation(client, { fixtureId: f.FixtureId, seq: row.Seq, statKey })) as ScoresStatValidation;
    }
  }
  throw new Error("no anchored fixture stat available on devnet right now");
}

async function main() {
  const payer = wallet();
  const connection = new Connection(RPC, "confirmed");
  const program = new Program(idl, new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" }));

  const v = await realValidation(connection, payer);
  const epochDay = epochDayFromMs(batchTimestamp(v));
  const value = v.statToProve.value;
  console.log(`fixture ${v.summary.fixtureId} stat ${v.statToProve.key}=${value} epochDay ${epochDay}`);

  const mint = await createMint(connection, payer, payer.publicKey, null, 6);
  const userB = Keypair.generate();
  await sendAndConfirmTransaction(connection, new Transaction().add(
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: userB.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })
  ), [payer]);
  const ataA = await getOrCreateAssociatedTokenAccount(connection, payer, mint, payer.publicKey);
  const ataB = await getOrCreateAssociatedTokenAccount(connection, payer, mint, userB.publicKey);
  await mintTo(connection, payer, mint, ataA.address, payer, 5_000_000);
  await mintTo(connection, payer, mint, ataB.address, payer, 5_000_000);

  const fixtureIdBN = new BN(v.summary.fixtureId);
  const nonce = new BN(Date.now());
  const [prop] = PublicKey.findProgramAddressSync(
    [Buffer.from("prop"), fixtureIdBN.toArrayLike(Buffer, "le", 8), payer.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)], program.programId);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), prop.toBuffer()], program.programId);
  const pos = (u: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("position"), prop.toBuffer(), u.toBuffer()], program.programId)[0];

  const now = Math.floor(Date.now() / 1000);
  await program.methods.createProp({
    nonce, fixtureId: fixtureIdBN, statKey: v.statToProve.key, period: v.statToProve.period,
    statKeyB: null, op: null, threshold: value + 1, comparison: { lessThan: {} },
    expectedEpochDay: epochDay, minDeposit: new BN(1_000_000),
    joinDeadline: new BN(now + SETTLE_DELAY_S), settleAfter: new BN(now + SETTLE_DELAY_S), creatorSide: true,
  }).accounts({
    prop, vault, creator: payer.publicKey, stakeMint: mint,
    systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID,
    rent: new PublicKey("SysvarRent111111111111111111111111111111111"),
  }).rpc();

  await program.methods.join(true, new BN(1_000_000)).accounts({
    prop, vault, position: pos(payer.publicKey), user: payer.publicKey, userTokenAccount: ataA.address,
    systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID }).rpc();
  await program.methods.join(false, new BN(2_000_000)).accounts({
    prop, vault, position: pos(userB.publicKey), user: userB.publicKey, userTokenAccount: ataB.address,
    systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID }).signers([userB]).rpc();

  console.log(`\nOPEN prop seeded: ${prop.toBase58()}`);
  console.log(`settle_after in ~${SETTLE_DELAY_S}s. Then run:  npm run crank -- --once`);
}

main().catch((e) => { console.error(e); process.exit(1); });
