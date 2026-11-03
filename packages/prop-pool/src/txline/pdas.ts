import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";

/**
 * PDA derivation for every Txoracle account this package touches. All seed
 * patterns are taken verbatim from the sponsor's runnable examples
 * (github.com/txodds/tx-on-chain/backup/examples/*) and cross-checked against
 * the on-chain account names in the IDL.
 *
 * The daily-root PDAs use a 2-byte little-endian epoch-day seed. Epoch day is
 * `floor(timestampMs / 86_400_000)` — note the source timestamps are in
 * MILLISECONDS.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Epoch day (days since Unix epoch) from a millisecond timestamp. */
export function epochDayFromMs(timestampMs: number): number {
  return Math.floor(timestampMs / MS_PER_DAY);
}

function epochDaySeed(epochDay: number): Buffer {
  return new BN(epochDay).toArrayLike(Buffer, "le", 2);
}

/** Subscription / treasury PDAs (used by subscribe + purchase flows). */
export function deriveTreasuryPdas(programId: PublicKey, txlMint: PublicKey) {
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    programId
  );
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    programId
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    txlMint,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID
  );
  const [usdtTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("usdt_treasury")],
    programId
  );
  return {
    pricingMatrixPda,
    tokenTreasuryPda,
    tokenTreasuryVault,
    usdtTreasuryPda,
  };
}

/**
 * Daily scores-roots PDA — the account `validate_stat` reads from
 * (`dailyScoresMerkleRoots`). Seed: "daily_scores_roots" + epochDay(le,2).
 */
export function deriveDailyScoresPda(
  programId: PublicKey,
  epochDay: number
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("daily_scores_roots"), epochDaySeed(epochDay)],
    programId
  )[0];
}

/**
 * Daily odds-roots PDA — the account `validate_odds` reads from
 * (`dailyOddsMerkleRoots`). Seed: "daily_batch_roots" + epochDay(le,2).
 * (The on-chain account is named `daily_odds_merkle_roots` but its seed prefix
 * is "daily_batch_roots" — confirmed in validate_odds_onchain.ts.)
 */
export function deriveDailyOddsPda(
  programId: PublicKey,
  epochDay: number
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("daily_batch_roots"), epochDaySeed(epochDay)],
    programId
  )[0];
}

/**
 * Ten-daily fixtures-roots PDA — the account `validate_fixture` reads from.
 * Seed: "ten_daily_fixtures_roots" + alignedEpochDay(le,2), where the epoch day
 * is floored to the nearest multiple of 10.
 */
export function deriveTenDailyFixturesPda(
  programId: PublicKey,
  epochDay: number
): PublicKey {
  const alignedEpochDay = Math.floor(epochDay / 10) * 10;
  return PublicKey.findProgramAddressSync(
    [Buffer.from("ten_daily_fixtures_roots"), epochDaySeed(alignedEpochDay)],
    programId
  )[0];
}
