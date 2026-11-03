/**
 * txline-anchor — shared TxLINE / TxODDS Txoracle integration client.
 *
 * Public surface consumed by `sidefoot` and `fulltime`. Neither downstream repo
 * should call the TxLINE REST API or the Txoracle program directly — everything
 * they need is re-exported here.
 */

// Config + network
export {
  NETWORKS,
  IDL,
  DEVNET_PROGRAM_ID,
  MAINNET_PROGRAM_ID,
  DEVNET_TXL_MINT,
  MAINNET_TXL_MINT,
  MAINNET_USDT_MINT,
  networkConfig,
  idlForNetwork,
  txlineMint,
  usdtMint,
} from "./config";
export type { Network, NetworkConfig } from "./config";

// Program construction
export { loadProgram, makeProvider, connect } from "./program";

// Auth + subscription
export {
  startGuestSession,
  buildActivationSignature,
  activateToken,
  signAndActivate,
} from "./auth";
export {
  subscribe,
  subscribeFreeWorldCup,
} from "./subscribe";
export type { SubscribeOptions, SubscribeResult } from "./subscribe";

// HTTP client + data
export { createClient } from "./client";
export type { ClientOptions } from "./client";
export {
  getFixturesSnapshot,
  getOddsSnapshot,
  getOddsUpdates,
  getOddsValidation,
  getScoresSnapshot,
  getScoresUpdates,
  getScoresHistorical,
  getStatValidation,
} from "./data";

// Streaming
export { streamOdds, streamScores, parseSseFrame } from "./stream";
export type { StreamOptions } from "./stream";

// Stat-key encoding
export {
  BASE_STAT_KEYS,
  PERIOD_MULTIPLIER,
  statKey,
  decodeStatKey,
  encodeStatKeys,
} from "./statKeys";
export type { BaseStatKey, Period } from "./statKeys";

// PDAs
export {
  epochDayFromMs,
  deriveTreasuryPdas,
  deriveDailyScoresPda,
  deriveDailyOddsPda,
  deriveTenDailyFixturesPda,
} from "./pdas";

// On-chain validation
export {
  MAX_COMPUTE_UNITS,
  toBytes32,
  toProofNodes,
  buildScoresBatchSummary,
  buildStatTerm,
  batchTimestamp,
  validateStatOnChain,
  checkStatOnChain,
  validateOddsOnChain,
} from "./validate";
export type { ValidateStatOptions } from "./validate";

// Shared types
export type {
  TokenResponse,
  ActivationPayload,
  Fixture,
  OddsPayload,
  Scores,
  ProofNode,
  ScoreStat,
  UpdateStats,
  ScoresBatchSummary,
  ScoresStatValidation,
  ScoresStatValidationV2,
  OddsBatchSummary,
  OddsValidation,
  Comparison,
  BinaryExpression,
  Predicate,
  SseMessage,
  OddsStreamMessage,
  ScoresStreamMessage,
} from "./types";
