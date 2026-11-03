import type { BN } from "@coral-xyz/anchor";

/**
 * Shared TypeScript types for the TxLINE integration, mirroring the off-chain
 * OpenAPI schemas (docs.yaml, v1.5.2) and the on-chain Txoracle instruction
 * argument shapes. Both `sidefoot` and `fulltime` import from here so the two
 * repos never hand-roll divergent copies of these shapes.
 *
 * Numeric fields the API documents as int64 (`Ts`, `FixtureId`, timestamps) are
 * typed `number` here for ergonomics — JS numbers safely hold values well below
 * 2^53. On-chain argument builders re-wrap them in `BN` where Anchor requires
 * it (see validate.ts).
 */

// ── Auth ────────────────────────────────────────────────────────────────────
export interface TokenResponse {
  token: string;
}

export interface ActivationPayload {
  txSig: string;
  walletSignature: string; // base64 detached signature
  leagues: number[];
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
export interface Fixture {
  Ts: number;
  StartTime: number;
  Competition: string;
  CompetitionId: number;
  FixtureGroupId: number;
  Participant1Id: number;
  Participant1: string;
  Participant2Id: number;
  Participant2: string;
  FixtureId: number;
  Participant1IsHome: boolean;
}

// ── Odds ──────────────────────────────────────────────────────────────────────
export interface OddsPayload {
  FixtureId: number;
  MessageId: string;
  Ts: number;
  Bookmaker: string;
  BookmakerId: number;
  SuperOddsType: string;
  GameState?: string;
  InRunning: boolean;
  MarketParameters?: string;
  MarketPeriod?: string;
  PriceNames?: string[];
  Prices?: number[];
  /** Demargined percentages, "NN.NNN" or "NA". */
  Pct?: string[];
}

// ── Scores ────────────────────────────────────────────────────────────────────
/**
 * Full Scores record as returned by the LIVE snapshot/stream endpoints.
 *
 * IMPORTANT: the live API returns these keys in **PascalCase** (`FixtureId`,
 * `Seq`, `Stats`, `Score`, `Action`, …), NOT the camelCase the OpenAPI schema
 * documents — verified against devnet 2026-07-01. The fields below match the
 * wire format. Sport-specific blobs (`Score`, `Data`) are typed loosely on
 * purpose; downstream code narrows what it needs.
 */
export interface Scores {
  FixtureId: number;
  GameState: string;
  StartTime: number;
  IsTeam: boolean;
  FixtureGroupId: number;
  CompetitionId: number;
  CountryId: number;
  SportId: number;
  Participant1IsHome: boolean;
  Participant2Id: number;
  Participant1Id: number;
  Action: string;
  Id: number;
  Ts: number;
  ConnectionId: number;
  Seq: number;
  Confirmed?: boolean;
  CoverageType?: string;
  Type?: string;
  /** Map of stat-key → value for this update (see statKeys.ts). */
  Stats?: Record<string, number>;
  /** Soccer score tree (per-period Goals/Corners/YellowCards/RedCards). */
  Score?: unknown;
  Data?: unknown;
  Clock?: { Running: boolean; Seconds: number };
  [k: string]: unknown;
}

// ── Merkle proofs (off-chain API shapes) ─────────────────────────────────────
/**
 * A single Merkle proof node as returned by the API. `hash` is documented as
 * `format: binary`; in practice the API returns it in a form Anchor can coerce
 * to a `[u8; 32]`. `toBytes32` in validate.ts normalises it defensively.
 */
export interface ProofNode {
  hash: number[] | string;
  isRightSibling: boolean;
}

export interface ScoreStat {
  key: number;
  value: number;
  period: number;
}

export interface UpdateStats {
  updateCount: number;
  minTimestamp: number;
  maxTimestamp: number;
}

export interface ScoresBatchSummary {
  fixtureId: number;
  updateStats: UpdateStats;
  /** API field name; maps to on-chain `eventsSubTreeRoot`. */
  eventStatsSubTreeRoot: number[] | string;
}

/** `GET /api/scores/stat-validation` — legacy mode (statKey / statKey2). */
export interface ScoresStatValidation {
  ts: number;
  statToProve: ScoreStat;
  eventStatRoot: number[] | string;
  summary: ScoresBatchSummary;
  statProof: ProofNode[];
  subTreeProof: ProofNode[];
  mainTreeProof: ProofNode[];
  statToProve2?: ScoreStat;
  statProof2?: ProofNode[];
}

/** `GET /api/scores/stat-validation` — V2 mode (statKeys, N-dimensional). */
export interface ScoresStatValidationV2 {
  ts: number;
  statsToProve?: ScoreStat[];
  eventStatRoot: number[] | string;
  summary: ScoresBatchSummary;
  statProofs?: ProofNode[][];
  subTreeProof: ProofNode[];
  mainTreeProof: ProofNode[];
}

export interface OddsBatchSummary {
  fixtureId: number;
  updateStats: UpdateStats;
  oddsSubTreeRoot: number[] | string;
}

/** `GET /api/odds/validation` — message/batch-level proof (NOT per-stat). */
export interface OddsValidation {
  odds: OddsPayload;
  summary: OddsBatchSummary;
  subTreeProof: ProofNode[];
  mainTreeProof: ProofNode[];
}

// ── On-chain predicate helpers ───────────────────────────────────────────────
/** Anchor enum shape for the on-chain `Comparison` type. */
export type Comparison =
  | { greaterThan: Record<string, never> }
  | { lessThan: Record<string, never> }
  | { equalTo: Record<string, never> };

/** Anchor enum shape for the on-chain `BinaryExpression` (two-stat) type. */
export type BinaryExpression =
  | { add: Record<string, never> }
  | { subtract: Record<string, never> };

/** On-chain `TraderPredicate`: assert `<value> <comparison> threshold`. */
export interface Predicate {
  threshold: number;
  comparison: Comparison;
}

// ── SSE ───────────────────────────────────────────────────────────────────────
export interface SseMessage<T = unknown> {
  /** Event id, format `timestamp:index` for data messages. */
  id?: string;
  /** e.g. "heartbeat"; absent for ordinary data messages. */
  event?: string;
  /** Parsed JSON payload (a single Odds or Scores record for data messages). */
  data: T;
}

/** Convenience aliases used across the streaming API. */
export type OddsStreamMessage = SseMessage<OddsPayload>;
export type ScoresStreamMessage = SseMessage<Scores>;

// Re-export BN type for downstream consumers that build raw args.
export type { BN };
