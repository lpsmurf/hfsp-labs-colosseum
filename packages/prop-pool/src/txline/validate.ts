import { ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import { BN, Program } from "@coral-xyz/anchor";
import type { Txoracle } from "./idl/txoracle";
import type {
  BinaryExpression,
  OddsValidation,
  Predicate,
  ProofNode,
  ScoresBatchSummary,
  ScoresStatValidation,
  ScoreStat,
} from "./types";
import { deriveDailyOddsPda, deriveDailyScoresPda, epochDayFromMs } from "./pdas";

/**
 * On-chain proof validation wrappers around the Txoracle `validate_stat` and
 * `validate_odds` instructions.
 *
 * Semantics — VERIFIED against live devnet program logs (2026-07-01), and they
 * differ from what the IDL suggests:
 *
 *   `validate_stat` REVERTS only if the Merkle proof / account integrity is
 *   invalid (i.e. the stat is not authentic). If the proof is valid it always
 *   succeeds and RETURNS the predicate evaluation as program return data — one
 *   byte, 0x01 (true) / 0x00 (false). It does NOT revert on a false predicate.
 *   (The IDL declares no `returns`, so this return value is undocumented there
 *   and must be read from the return data / logs — which these wrappers do.)
 *
 * Therefore:
 *   - `checkStatOnChain` simulates and returns the predicate boolean, for
 *     callers (e.g. Sidefoot's divergence detector) that want the proven truth
 *     value without paying for a transaction. It throws only if the proof
 *     itself is invalid.
 *   - `validateStatOnChain` sends a real tx (a permanent on-chain record that
 *     the stat was proven authentic) and also returns the evaluated predicate.
 *
 * `validate_stat` consumes ~193K CU in practice but must be given headroom; we
 * request the full ~1.4M ceiling. It can't be casually composed inside another
 * instruction that also does meaningful work — flagged for Fulltime settlement.
 */

/** Solana's per-transaction compute-unit ceiling; validate_stat needs ~all of it. */
export const MAX_COMPUTE_UNITS = 1_400_000;

// ── byte / proof coercion ────────────────────────────────────────────────────
/**
 * Normalise an API hash (`format: binary`) into an unsigned `number[32]` that
 * Anchor can serialise as `[u8; 32]`. The API returns hashes as SIGNED
 * (Java-style, −128..127) byte arrays; some deployments may send base64/hex.
 */
export function toBytes32(hash: number[] | string): number[] {
  let bytes: number[];
  if (typeof hash === "string") {
    const buf = /^[0-9a-fA-F]{64}$/.test(hash)
      ? Buffer.from(hash, "hex")
      : Buffer.from(hash, "base64");
    bytes = Array.from(buf);
  } else {
    bytes = hash.map((b) => (b < 0 ? b + 256 : b));
  }
  if (bytes.length !== 32) {
    throw new Error(`expected 32-byte hash, got ${bytes.length}`);
  }
  return bytes;
}

/** Map API proof nodes into the on-chain ProofNode shape (unsigned hashes). */
export function toProofNodes(nodes: ProofNode[]): {
  hash: number[];
  isRightSibling: boolean;
}[] {
  return nodes.map((n) => ({
    hash: toBytes32(n.hash),
    isRightSibling: n.isRightSibling,
  }));
}

/** Build the on-chain `ScoresBatchSummary` arg from the API summary. */
export function buildScoresBatchSummary(summary: ScoresBatchSummary) {
  return {
    fixtureId: new BN(summary.fixtureId),
    updateStats: {
      updateCount: summary.updateStats.updateCount,
      minTimestamp: new BN(summary.updateStats.minTimestamp),
      maxTimestamp: new BN(summary.updateStats.maxTimestamp),
    },
    // API field `eventStatsSubTreeRoot` → on-chain field `eventsSubTreeRoot`.
    eventsSubTreeRoot: toBytes32(summary.eventStatsSubTreeRoot),
  };
}

/** Build an on-chain `StatTerm` from a stat + its event root + stat proof. */
export function buildStatTerm(
  stat: ScoreStat,
  eventStatRoot: number[] | string,
  statProof: ProofNode[]
) {
  return {
    statToProve: { key: stat.key, value: stat.value, period: stat.period },
    eventStatRoot: toBytes32(eventStatRoot),
    statProof: toProofNodes(statProof),
  };
}

// ── validate_stat ─────────────────────────────────────────────────────────────
export interface ValidateStatOptions {
  /**
   * Optional second stat + operator for two-stat predicates (e.g. prove
   * `stat_a - stat_b < threshold`). When provided, the predicate is checked
   * against the combined expression.
   */
  secondStat?: { stat: ScoreStat; statProof: ProofNode[] };
  op?: BinaryExpression;
  /** Override the daily-scores PDA (defaults to one derived from the batch ts). */
  dailyScoresPda?: PublicKey;
  computeUnits?: number;
}

/**
 * The timestamp `validate_stat` uses for BOTH seed (epoch-day) generation and
 * its on-chain equality check is the batch START timestamp
 * (`summary.updateStats.minTimestamp`) — NOT the top-level event `ts`. Passing
 * the event `ts` triggers on-chain error 6010 `TimestampMismatch`.
 *
 * (The sponsor's older example passed `validation.ts` because the previous API
 * returned the batch timestamp there; the live API returns the event timestamp
 * at top level, so we read the batch timestamp from the summary explicitly.)
 */
export function batchTimestamp(validation: ScoresStatValidation): number {
  return validation.summary.updateStats.minTimestamp;
}

/** Assemble the positional args for the `validateStat` instruction. */
function buildValidateStatArgs(
  validation: ScoresStatValidation,
  predicate: Predicate,
  opts: ValidateStatOptions
) {
  const statA = buildStatTerm(
    validation.statToProve,
    validation.eventStatRoot,
    validation.statProof
  );
  const statB = opts.secondStat
    ? buildStatTerm(
        opts.secondStat.stat,
        validation.eventStatRoot,
        opts.secondStat.statProof
      )
    : null;
  return [
    new BN(batchTimestamp(validation)),
    buildScoresBatchSummary(validation.summary),
    toProofNodes(validation.subTreeProof),
    toProofNodes(validation.mainTreeProof),
    predicate,
    statA,
    statB,
    opts.op ?? null,
  ] as const;
}

/**
 * Parse the one-byte boolean the program returns from a `Program return:` log
 * line (base64-encoded). Anchor's simulate exposes logs on `.raw`.
 */
function parseReturnBool(logs: readonly string[], programId: string): boolean {
  const prefix = `Program return: ${programId} `;
  for (let i = logs.length - 1; i >= 0; i--) {
    if (logs[i].startsWith(prefix)) {
      const buf = Buffer.from(logs[i].slice(prefix.length).trim(), "base64");
      return buf.length > 0 && buf[0] !== 0;
    }
  }
  throw new Error("validate_stat returned no predicate result in logs");
}

/**
 * Simulate `validate_stat` and return the evaluated predicate boolean. Throws if
 * the proof is invalid (the program reverts) or if no return data is produced.
 * This is the read-only "does this proven stat satisfy the predicate" primitive.
 */
export async function checkStatOnChain(
  program: Program<Txoracle>,
  validation: ScoresStatValidation,
  predicate: Predicate,
  opts: ValidateStatOptions = {}
): Promise<boolean> {
  const dailyScoresPda =
    opts.dailyScoresPda ??
    deriveDailyScoresPda(program.programId, epochDayFromMs(batchTimestamp(validation)));

  const resp = await program.methods
    .validateStat(...buildValidateStatArgs(validation, predicate, opts))
    .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: opts.computeUnits ?? MAX_COMPUTE_UNITS,
      }),
    ])
    .simulate();

  return parseReturnBool(resp.raw ?? [], program.programId.toBase58());
}

/**
 * Submit a real on-chain `validate_stat` transaction — a permanent record that
 * the stat was proven authentic against the committed root. Also returns the
 * evaluated predicate (`predicateResult`). Throws if the proof is invalid.
 *
 * The predicate result is obtained from a pre-flight simulation (which also
 * fails fast on an invalid proof before spending the transaction); for
 * historical data it is deterministic and equals what the landed tx computes.
 */
export async function validateStatOnChain(
  program: Program<Txoracle>,
  validation: ScoresStatValidation,
  predicate: Predicate,
  opts: ValidateStatOptions = {}
): Promise<{ signature: string; predicateResult: boolean; dailyScoresPda: PublicKey }> {
  const dailyScoresPda =
    opts.dailyScoresPda ??
    deriveDailyScoresPda(program.programId, epochDayFromMs(batchTimestamp(validation)));

  const predicateResult = await checkStatOnChain(program, validation, predicate, {
    ...opts,
    dailyScoresPda,
  });

  const signature = await program.methods
    .validateStat(...buildValidateStatArgs(validation, predicate, opts))
    .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: opts.computeUnits ?? MAX_COMPUTE_UNITS,
      }),
    ])
    .rpc();

  return { signature, predicateResult, dailyScoresPda };
}

// ── validate_odds ─────────────────────────────────────────────────────────────
/**
 * Submit an on-chain `validate_odds` transaction, proving a single odds update
 * belongs to the on-chain-committed batch root. Returns the confirmed signature.
 *
 * NOTE: odds proofs are MESSAGE/BATCH-level (prove membership of a specific
 * odds record), not per-statistic threshold predicates like scores. There is no
 * odds equivalent of the stat-validation predicate flow — this resolves the
 * plan's §5 open item. Downstream consensus/divergence logic on odds must be
 * built off proven membership + the odds payload, not an on-chain predicate.
 */
export async function validateOddsOnChain(
  program: Program<Txoracle>,
  validation: OddsValidation,
  opts: { dailyOddsPda?: PublicKey; computeUnits?: number } = {}
): Promise<{ signature: string; dailyOddsPda: PublicKey }> {
  const dailyOddsPda =
    opts.dailyOddsPda ??
    deriveDailyOddsPda(program.programId, epochDayFromMs(validation.odds.Ts));

  const odds = {
    fixtureId: new BN(validation.odds.FixtureId),
    messageId: validation.odds.MessageId,
    ts: new BN(validation.odds.Ts),
    bookmaker: validation.odds.Bookmaker,
    bookmakerId: validation.odds.BookmakerId,
    superOddsType: validation.odds.SuperOddsType,
    gameState: validation.odds.GameState ?? null,
    inRunning: validation.odds.InRunning,
    marketParameters: validation.odds.MarketParameters ?? null,
    marketPeriod: validation.odds.MarketPeriod ?? null,
    priceNames: validation.odds.PriceNames,
    prices: validation.odds.Prices,
  };

  const summary = {
    fixtureId: new BN(validation.summary.fixtureId),
    updateStats: {
      updateCount: validation.summary.updateStats.updateCount,
      minTimestamp: new BN(validation.summary.updateStats.minTimestamp),
      maxTimestamp: new BN(validation.summary.updateStats.maxTimestamp),
    },
    oddsSubTreeRoot: toBytes32(validation.summary.oddsSubTreeRoot),
  };

  const signature = await program.methods
    .validateOdds(
      new BN(validation.odds.Ts),
      odds as any,
      summary as any,
      toProofNodes(validation.subTreeProof),
      toProofNodes(validation.mainTreeProof)
    )
    .accounts({ dailyOddsMerkleRoots: dailyOddsPda })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({
        units: opts.computeUnits ?? MAX_COMPUTE_UNITS,
      }),
    ])
    .rpc();

  return { signature, dailyOddsPda };
}
