/**
 * PropPool devnet integration test (standalone tsx script; run via `anchor test`
 * or `npx tsx tests/prop-pool.test.ts`).
 *
 * Exercises the full trustless flow against LIVE devnet + the real txoracle:
 *   create_prop -> two users join opposite sides -> settle() (CPI into
 *   txoracle::validate_stat with a REAL proof) -> winner claim, loser rejected.
 * Plus: double-settle guard.
 *
 * Reuses the vendored TxLINE SDK to obtain a real stat proof (same path as M0).
 * Requires: `anchor build` done (target/idl/prop_pool.json present), a funded
 * devnet wallet at .devnet-wallet.json, and the prop_pool program deployed to
 * devnet (anchor test deploys it).
 *
 * DEVNET ONLY. Uses a throwaway 6-decimal SPL mint as "USDC".
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
  clusterApiUrl,
} from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  makeProvider,
  loadProgram as loadTxoracle,
  networkConfig,
  startGuestSession,
  subscribeFreeWorldCup,
  signAndActivate,
  createClient,
  getFixturesSnapshot,
  getScoresSnapshot,
  getStatValidation,
  deriveDailyScoresPda,
  epochDayFromMs,
  batchTimestamp,
  buildScoresBatchSummary,
  buildStatTerm,
  toProofNodes,
} from "../src/txline/index";
import type { ScoresStatValidation, Scores } from "../src/txline/index";

const PKG = resolve(__dirname, "..");
const RPC = process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet");
const cfg = networkConfig("devnet");
const TXORACLE = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

const idl = JSON.parse(readFileSync(resolve(PKG, "target/idl/prop_pool.json"), "utf8"));
const CACHE = resolve(PKG, ".m0-cache.json");

const log = (s = "") => console.log(s);
let failures = 0;
function check(name: string, cond: boolean) {
  log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadWallet(): Keypair {
  const secret = Uint8Array.from(JSON.parse(readFileSync(resolve(PKG, ".devnet-wallet.json"), "utf8")));
  return Keypair.fromSecretKey(secret);
}

async function getRealValidation(connection: Connection, kp: Keypair): Promise<ScoresStatValidation> {
  // Reuse M0's cached auth if present; otherwise run the full flow.
  let jwt: string, apiToken: string;
  const pk = kp.publicKey.toBase58();
  try {
    const c = JSON.parse(readFileSync(CACHE, "utf8"));
    if (c.pubkey !== pk) throw new Error("cache mismatch");
    ({ jwt, apiToken } = c);
  } catch {
    const program = loadTxoracle(makeProvider(connection, new Wallet(kp)), "devnet");
    jwt = await startGuestSession(cfg.apiOrigin);
    const { txSig } = await subscribeFreeWorldCup(program);
    apiToken = await signAndActivate(cfg.apiOrigin, jwt, txSig, [], kp.secretKey);
  }
  const client = createClient({ apiOrigin: cfg.apiOrigin, jwt, apiToken });
  const fixtures = await getFixturesSnapshot(client);
  for (const f of fixtures) {
    let scores: Scores[];
    try {
      scores = await getScoresSnapshot(client, f.FixtureId);
    } catch {
      continue;
    }
    const row = [...scores].reverse().find((s) => s.Stats && Object.keys(s.Stats).length > 0);
    if (row && row.Stats) {
      const statKey = Number(Object.keys(row.Stats)[0]);
      return (await getStatValidation(client, { fixtureId: f.FixtureId, seq: row.Seq, statKey })) as ScoresStatValidation;
    }
  }
  throw new Error("no played free-tier fixture with stats currently available on devnet");
}

async function main() {
  log("PropPool — devnet integration test\n");
  const payer = loadWallet();
  const connection = new Connection(RPC, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" });
  const program = new Program(idl, provider);
  log(`program: ${program.programId.toBase58()}`);
  log(`payer:   ${payer.publicKey.toBase58()}`);

  const bal = (await connection.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL;
  log(`balance: ${bal} SOL`);
  if (bal < 0.2) throw new Error("need more devnet SOL for deploy + test");

  // Real proof (defines the prop's terms so settle() verifies).
  log("\n[proof] fetching a real stat validation from TxLINE devnet…");
  const v = await getRealValidation(connection, payer);
  const value = v.statToProve.value;
  const batchTs = batchTimestamp(v);
  const epochDay = epochDayFromMs(batchTs);
  const dailyScoresPda = deriveDailyScoresPda(TXORACLE, epochDay);
  log(`[proof] fixture ${v.summary.fixtureId} stat key=${v.statToProve.key} value=${value} epochDay=${epochDay}`);

  // Throwaway 6-decimal "USDC" mint; payer is authority.
  log("\n[setup] creating test mint + funding two users…");
  const mint = await createMint(connection, payer, payer.publicKey, null, 6);
  const userA = payer; // creator + OVER side
  const userB = Keypair.generate(); // UNDER side
  // fund userB with SOL for fees + rent
  {
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: userB.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })
    );
    await sendAndConfirmTransaction(connection, tx, [payer]);
  }
  const ataA = await getOrCreateAssociatedTokenAccount(connection, payer, mint, userA.publicKey);
  const ataB = await getOrCreateAssociatedTokenAccount(connection, payer, mint, userB.publicKey);
  await mintTo(connection, payer, mint, ataA.address, payer, 10_000_000); // 10 USDC
  await mintTo(connection, payer, mint, ataB.address, payer, 10_000_000);

  // PDAs
  const fixtureIdBN = new BN(v.summary.fixtureId);
  const nonce = new BN(Date.now());
  const [propPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("prop"), fixtureIdBN.toArrayLike(Buffer, "le", 8), userA.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
    program.programId
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), propPda.toBuffer()],
    program.programId
  );
  const positionPda = (user: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("position"), propPda.toBuffer(), user.toBuffer()], program.programId)[0];

  // create_prop — tight windows so we can settle during the test run.
  const now = Math.floor(Date.now() / 1000);
  const joinDeadline = now + 12;
  const settleAfter = now + 12;
  log("\n[create_prop]…");
  await program.methods
    .createProp({
      nonce,
      fixtureId: fixtureIdBN,
      statKey: v.statToProve.key,
      period: v.statToProve.period,
      statKeyB: null,
      op: null,
      threshold: value + 1, // value < value+1  => predicate TRUE => OVER wins
      comparison: { lessThan: {} },
      expectedEpochDay: epochDay,
      minDeposit: new BN(1_000_000),
      joinDeadline: new BN(joinDeadline),
      settleAfter: new BN(settleAfter),
      creatorSide: true,
    })
    .accounts({
      prop: propPda,
      vault: vaultPda,
      creator: userA.publicKey,
      stakeMint: mint,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: new PublicKey("SysvarRent111111111111111111111111111111111"),
    })
    .rpc();
  check("prop created", !!(await program.account.prop.fetch(propPda)));

  // joins: A on OVER (true) 1 USDC, B on UNDER (false) 2 USDC
  log("[join] userA OVER 1, userB UNDER 2…");
  await program.methods.join(true, new BN(1_000_000))
    .accounts({ prop: propPda, vault: vaultPda, position: positionPda(userA.publicKey), user: userA.publicKey, userTokenAccount: ataA.address, systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  await program.methods.join(false, new BN(2_000_000))
    .accounts({ prop: propPda, vault: vaultPda, position: positionPda(userB.publicKey), user: userB.publicKey, userTokenAccount: ataB.address, systemProgram: SystemProgram.programId, tokenProgram: TOKEN_PROGRAM_ID })
    .signers([userB])
    .rpc();
  const afterJoin = await program.account.prop.fetch(propPda);
  check("total pool = 3 USDC", (afterJoin.totalPool as BN).toNumber() === 3_000_000);

  // wait for settle window
  const waitMs = (settleAfter + 2) * 1000 - Date.now();
  if (waitMs > 0) { log(`[wait] ${Math.ceil(waitMs / 1000)}s for settle window…`); await sleep(waitMs); }

  // settle via real CPI
  log("[settle] CPI into txoracle::validate_stat…");
  const statA = buildStatTerm(v.statToProve, v.eventStatRoot, v.statProof);
  await program.methods
    .settle(
      new BN(batchTs),
      buildScoresBatchSummary(v.summary) as any,
      toProofNodes(v.subTreeProof) as any,
      toProofNodes(v.mainTreeProof) as any,
      statA as any,
      null,
      null
    )
    .accounts({ prop: propPda, dailyScoresMerkleRoots: dailyScoresPda, txoracleProgram: TXORACLE, settler: userA.publicKey })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
    .rpc();
  const settled = await program.account.prop.fetch(propPda);
  check("status = Settled", JSON.stringify(settled.status) === JSON.stringify({ settled: {} }));
  check("winning side = OVER (true)", settled.winningSide === true);

  // double-settle guard
  let doubleFailed = false;
  try {
    await program.methods
      .settle(new BN(batchTs), buildScoresBatchSummary(v.summary) as any, toProofNodes(v.subTreeProof) as any, toProofNodes(v.mainTreeProof) as any, statA as any, null, null)
      .accounts({ prop: propPda, dailyScoresMerkleRoots: dailyScoresPda, txoracleProgram: TXORACLE, settler: userA.publicKey })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
      .rpc();
  } catch { doubleFailed = true; }
  check("double-settle rejected", doubleFailed);

  // loser (userB) cannot claim
  let loserRejected = false;
  try {
    await program.methods.claim()
      .accounts({ prop: propPda, vault: vaultPda, position: positionPda(userB.publicKey), userTokenAccount: ataB.address, user: userB.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([userB]).rpc();
  } catch { loserRejected = true; }
  check("loser claim rejected", loserRejected);

  // winner (userA) claims the whole 3 USDC pool
  const beforeA = Number((await getAccount(connection, ataA.address)).amount);
  await program.methods.claim()
    .accounts({ prop: propPda, vault: vaultPda, position: positionPda(userA.publicKey), userTokenAccount: ataA.address, user: userA.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
    .rpc();
  const afterA = Number((await getAccount(connection, ataA.address)).amount);
  check("winner received full pool (3 USDC)", afterA - beforeA === 3_000_000);
  const vaultBal = Number((await getAccount(connection, vaultPda)).amount);
  check("vault drained to 0", vaultBal === 0);

  log(`\n${failures === 0 ? "ALL PASS ✅" : `${failures} FAILURE(S) ❌`}`);
  if (failures) process.exit(1);
}

main().catch((e) => { console.error("\nTEST FAILED:", e); process.exit(1); });
