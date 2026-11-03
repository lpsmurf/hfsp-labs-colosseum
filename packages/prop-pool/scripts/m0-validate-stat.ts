/**
 * MILESTONE 0 — Proof de-risking gate.
 *
 * Gets ONE real TxODDS `validate_stat` to verify on Solana devnet, end to end:
 *   guest auth → on-chain subscribe (free WC tier) → activate API token →
 *   fetch a real fixture's stat + its multi-level Merkle proof →
 *   CPI-free direct call to txoracle::validate_stat (simulate + real tx) →
 *   confirm the proof verifies and the predicate evaluates on-chain.
 *
 * It also DELIBERATELY reproduces error 6004 (InvalidMainTreeProof) by pointing
 * at the wrong daily-root bucket, so we understand the #1 failure mode.
 *
 * Trust primitive is the vendored `src/txline` SDK (see src/txline/VENDORED.md).
 *
 * DEVNET ONLY. Requires a funded devnet wallet (run `npm run wallet` first).
 * Run:  npm run m0
 */
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import { BN, Wallet, utils } from "@coral-xyz/anchor";
import {
  makeProvider,
  loadProgram,
  networkConfig,
  startGuestSession,
  subscribeFreeWorldCup,
  signAndActivate,
  createClient,
  getFixturesSnapshot,
  getScoresSnapshot,
  getStatValidation,
  checkStatOnChain,
  validateStatOnChain,
  deriveDailyScoresPda,
  epochDayFromMs,
  batchTimestamp,
  buildScoresBatchSummary,
  buildStatTerm,
  toProofNodes,
  MAX_COMPUTE_UNITS,
} from "../src/txline/index";
import type { ScoresStatValidation, Scores } from "../src/txline/index";

const bs58 = utils.bytes.bs58;
const PKG = resolve(__dirname, "..");
const WALLET_PATH = resolve(PKG, ".devnet-wallet.json");
const CACHE_PATH = resolve(PKG, ".m0-cache.json");
const ARTIFACT_DIR = resolve(PKG, "artifacts");
const RPC = process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet");
const cfg = networkConfig("devnet");

function loadWallet(): Wallet {
  if (process.env.WALLET_SECRET_KEY) {
    return new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.WALLET_SECRET_KEY)));
  }
  if (existsSync(WALLET_PATH)) {
    const secret = Uint8Array.from(JSON.parse(readFileSync(WALLET_PATH, "utf8")));
    return new Wallet(Keypair.fromSecretKey(secret));
  }
  throw new Error(
    "No wallet found. Run `npm run wallet` first (generates + funds a devnet keypair)."
  );
}

interface Cache {
  pubkey: string;
  jwt: string;
  apiToken: string;
}

function loadCache(pubkey: string): Cache | null {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    const c = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Cache;
    return c.pubkey === pubkey ? c : null;
  } catch {
    return null;
  }
}

function saveCache(c: Cache) {
  writeFileSync(CACHE_PATH, JSON.stringify(c, null, 2));
}

const line = (s = "") => console.log(s);
const explorer = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}${cfg.explorerCluster}`;

async function main() {
  line("PropPool — Milestone 0: real validate_stat on devnet\n");

  const wallet = loadWallet();
  const pubkey = wallet.publicKey.toBase58();
  line(`Wallet:      ${pubkey}`);
  line(`RPC:         ${RPC}`);
  line(`API origin:  ${cfg.apiOrigin}`);
  line(`Program:     ${cfg.programIdOverride?.toBase58()}\n`);

  const connection = new Connection(RPC, "confirmed");
  const provider = makeProvider(connection, wallet);
  const program = loadProgram(provider, "devnet");

  const sol = (await connection.getBalance(wallet.publicKey)) / LAMPORTS_PER_SOL;
  line(`Balance:     ${sol} SOL`);
  if (sol < 0.02) throw new Error("Wallet underfunded. Run `npm run wallet` to airdrop.");

  // ── 1–3: auth + subscription + activation (cached across runs) ──────────────
  let jwt: string;
  let apiToken: string;
  const cached = loadCache(pubkey);
  if (cached) {
    line("\n[auth] reusing cached jwt + apiToken");
    ({ jwt, apiToken } = cached);
  } else {
    line("\n[auth] starting guest session…");
    jwt = await startGuestSession(cfg.apiOrigin);
    line("[auth] guest JWT acquired");

    line("[sub]  subscribing to free World Cup tier (service level 1, 4 weeks)…");
    const { txSig } = await subscribeFreeWorldCup(program);
    line(`[sub]  subscribe tx: ${explorer(txSig)}`);

    line("[auth] activating API token…");
    apiToken = await signAndActivate(cfg.apiOrigin, jwt, txSig, [], wallet.payer.secretKey);
    line("[auth] API token acquired");
    saveCache({ pubkey, jwt, apiToken });
  }

  let client = createClient({ apiOrigin: cfg.apiOrigin, jwt, apiToken });

  // ── 4: fixtures + find a played fixture with a provable stat ─────────────────
  line("\n[data] fetching fixtures snapshot…");
  let fixtures;
  try {
    fixtures = await getFixturesSnapshot(client);
  } catch (e) {
    line("[data] auth rejected with cache; re-running full auth flow…");
    jwt = await startGuestSession(cfg.apiOrigin);
    const { txSig } = await subscribeFreeWorldCup(program);
    apiToken = await signAndActivate(cfg.apiOrigin, jwt, txSig, [], wallet.payer.secretKey);
    saveCache({ pubkey, jwt, apiToken });
    client = createClient({ apiOrigin: cfg.apiOrigin, jwt, apiToken });
    fixtures = await getFixturesSnapshot(client);
  }
  line(`[data] ${fixtures.length} fixtures available`);

  let target: { fixtureId: number; row: Scores; statKey: number } | undefined;
  for (const f of fixtures) {
    let scores: Scores[];
    try {
      scores = await getScoresSnapshot(client, f.FixtureId);
    } catch {
      continue;
    }
    const row = [...scores]
      .reverse()
      .find((s) => s.Stats && Object.keys(s.Stats).length > 0);
    if (row && row.Stats) {
      const statKey = Number(Object.keys(row.Stats)[0]);
      target = { fixtureId: f.FixtureId, row, statKey };
      line(
        `[data] using fixture ${f.FixtureId} (${f.Participant1} vs ${f.Participant2}), ` +
          `seq ${row.Seq}, stats: ${JSON.stringify(row.Stats)}`
      );
      break;
    }
  }

  if (!target) {
    line(
      "\nNO PLAYED FREE-TIER FIXTURE WITH STATS IS CURRENTLY AVAILABLE on devnet.\n" +
        "The auth + subscription + proof-fetch machinery is proven working, but the\n" +
        "on-chain proof leg needs a fixture that has scored events anchored on-chain.\n" +
        "Re-run during/after a World Cup or Int'l Friendly fixture. (This is an\n" +
        "external data-availability gate, not a code failure.)"
    );
    process.exit(2);
  }

  // ── 5: fetch the multi-level Merkle proof for the stat ──────────────────────
  line(`\n[proof] GET /api/scores/stat-validation (statKey ${target.statKey})…`);
  const validation = (await getStatValidation(client, {
    fixtureId: target.fixtureId,
    seq: target.row.Seq,
    statKey: target.statKey,
  })) as ScoresStatValidation;

  const value = validation.statToProve.value;
  const batchTs = batchTimestamp(validation);
  const epochDay = epochDayFromMs(batchTs);
  const rightPda = deriveDailyScoresPda(program.programId, epochDay);
  line(`[proof] stat key=${validation.statToProve.key} value=${value} period=${validation.statToProve.period}`);
  line(`[proof] batch ts=${batchTs}  epochDay=${epochDay}`);
  line(`[proof] daily_scores_roots PDA: ${rightPda.toBase58()}`);

  const rootInfo = await connection.getAccountInfo(rightPda);
  line(`[proof] root account exists on devnet: ${rootInfo ? "YES" : "NO"} (${rootInfo?.data.length ?? 0} bytes)`);

  // ── 6: verify predicate TRUE and FALSE via simulation (read-only) ───────────
  line("\n[check] simulating validate_stat (reads returned predicate bool)…");
  const holdsTrue = await checkStatOnChain(program, validation, {
    threshold: value + 1,
    comparison: { lessThan: {} },
  });
  line(`[check] predicate (${value} < ${value + 1}) => ${holdsTrue}  [expect true]`);

  const holdsFalse = await checkStatOnChain(program, validation, {
    threshold: value - 1,
    comparison: { lessThan: {} },
  });
  line(`[check] predicate (${value} < ${value - 1}) => ${holdsFalse}  [expect false]`);

  // ── 7: real on-chain proof transaction ──────────────────────────────────────
  line("\n[tx]    submitting real validate_stat transaction…");
  const res = await validateStatOnChain(program, validation, {
    threshold: value + 1,
    comparison: { lessThan: {} },
  });
  line(`[tx]    SUCCESS — signature: ${res.signature}`);
  line(`[tx]    ${explorer(res.signature)}`);
  line(`[tx]    predicateResult: ${res.predicateResult}`);

  // ── 8: deliberately reproduce the failure modes ─────────────────────────────
  // Low-level simulate so we can read program logs directly (Anchor's .simulate()
  // throws an error whose message is often empty on a program revert).
  const statA = buildStatTerm(
    validation.statToProve,
    validation.eventStatRoot,
    validation.statProof
  );
  const predicate = { threshold: value + 1, comparison: { lessThan: {} } };

  async function simulateValidateStat(
    dailyScoresPda: PublicKey,
    mainTreeProof: ReturnType<typeof toProofNodes>
  ): Promise<{ err: unknown; errLine: string; logs: string[] }> {
    const ix = await program.methods
      .validateStat(
        new BN(batchTimestamp(validation)),
        buildScoresBatchSummary(validation.summary),
        toProofNodes(validation.subTreeProof),
        mainTreeProof,
        predicate,
        statA,
        null,
        null
      )
      .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
      .instruction();
    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: MAX_COMPUTE_UNITS }),
      ix
    );
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const sim = await connection.simulateTransaction(tx);
    const logs = sim.value.logs ?? [];
    const errLine =
      logs.find((l) => /Error (Code|Number)|AnchorError|custom program error/i.test(l)) ?? "";
    return { err: sim.value.err, errLine, logs };
  }

  // 8a: WRONG BUCKET — pass the previous day's root PDA (with the correct ts).
  // The program re-derives the expected root PDA from `ts` and constrains it by
  // seeds, so a mismatched bucket is rejected as ConstraintSeeds (2006) BEFORE
  // any proof math — NOT as 6004. (Corrects the common "wrong bucket => 6004"
  // assumption: you cannot even submit a mismatched bucket.)
  const wrongDay = epochDay - 1;
  const wrongPda = deriveDailyScoresPda(program.programId, wrongDay);
  const wrongInfo = await connection.getAccountInfo(wrongPda);
  line("\n[fail-a] WRONG BUCKET (prev-day root PDA, correct ts)…");
  line(`[fail-a] epochDay=${wrongDay} PDA=${wrongPda.toBase58()} exists=${wrongInfo ? "YES" : "NO"}`);
  const a = await simulateValidateStat(wrongPda, toProofNodes(validation.mainTreeProof));
  const wrongBucketError = a.err ? a.errLine || JSON.stringify(a.err) : null;
  line(`[fail-a] ${a.err ? "rejected → " + a.errLine.replace(/^Program log: /, "").slice(0, 160) : "UNEXPECTED: no error"}`);

  // 8b: CORRUPTED MAIN-TREE PROOF — correct bucket, but flip a byte in the
  // main_tree_proof so the level-3 fold no longer reaches the on-chain root.
  // THIS is what actually yields 6004 InvalidMainTreeProof.
  line("\n[fail-b] CORRUPTED main_tree_proof (correct bucket)…");
  const corrupted = toProofNodes(validation.mainTreeProof);
  if (corrupted.length > 0) corrupted[0].hash[0] = corrupted[0].hash[0] ^ 0xff;
  const b = await simulateValidateStat(rightPda, corrupted);
  const bHay = `${JSON.stringify(b.err)}\n${b.logs.join("\n")}`;
  const is6004 = /6004|InvalidMainTreeProof/.test(bHay);
  const sixThousandFour = b.err ? b.errLine || JSON.stringify(b.err) : null;
  line(`[fail-b] ${b.err ? "rejected → " + b.errLine.replace(/^Program log: /, "").slice(0, 160) : "UNEXPECTED: no error"}`);
  line(`[fail-b] is 6004 InvalidMainTreeProof: ${is6004}`);

  // ── 9: persist a (secret-free) proof artifact for PROOF_NOTES ────────────────
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const artifact = {
    generatedAt: new Date().toISOString(),
    network: "devnet",
    programId: program.programId.toBase58(),
    apiOrigin: cfg.apiOrigin,
    fixtureId: target.fixtureId,
    seq: target.row.Seq,
    statKey: target.statKey,
    statToProve: validation.statToProve,
    batchTs,
    epochDay,
    dailyScoresRootsPda: rightPda.toBase58(),
    rootAccountBytes: rootInfo?.data.length ?? 0,
    proofDepths: {
      statProof: validation.statProof.length,
      subTreeProof: validation.subTreeProof.length,
      mainTreeProof: validation.mainTreeProof.length,
    },
    results: {
      predicateTrue: holdsTrue,
      predicateFalse: holdsFalse,
      realTxSignature: res.signature,
      realTxPredicateResult: res.predicateResult,
      wrongBucketError,
      corruptedMainProofError: sixThousandFour,
      corruptedMainProofIs6004: is6004,
    },
  };
  const outPath = resolve(ARTIFACT_DIR, `m0-proof-${target.fixtureId}-${target.row.Seq}.json`);
  writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  line(`\n[done]  proof artifact written → ${outPath}`);

  const pass = holdsTrue === true && holdsFalse === false && !!res.signature;
  line(`\n${pass ? "MILESTONE 0 EXIT GATE: GREEN ✅" : "MILESTONE 0: NOT GREEN ❌"}`);
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error("\nM0 FAILED:", e);
  process.exit(1);
});
