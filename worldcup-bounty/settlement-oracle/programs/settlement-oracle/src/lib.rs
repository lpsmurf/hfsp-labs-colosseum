//! Settlement Oracle — resolves prediction markets from TxLine score Merkle proofs.
//!
//! Trust model: a single authorised TxODDS signer commits a Merkle root for a batch
//! of finalised scores (`commit_root`). After that, ANYONE may `resolve` a fixture by
//! supplying the score + a proof that folds to the committed root. A liar's proof
//! fails verification and the tx reverts — settlement is permissionless yet trustless.
//!
//! Hashing mirrors `settlement-oracle/verify.ts` exactly: keccak256 leaves, sorted-pair
//! keccak folding (OZ-style). Confirm the leaf encoding against TxODDS before mainnet.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;

declare_id!("Set11ementOrac1eXXXXXXXXXXXXXXXXXXXXXXXXXXX"); // placeholder — `anchor keys sync` on init

#[program]
pub mod settlement_oracle {
    use super::*;

    /// One-time: record the admin and the authorised TxODDS root-signer key.
    pub fn initialize(ctx: Context<Initialize>, txodds_signer: Pubkey) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.txodds_signer = txodds_signer;
        cfg.batch_count = 0;
        Ok(())
    }

    /// Only the TxODDS signer: store the Merkle root for a batch of finalised scores.
    pub fn commit_root(ctx: Context<CommitRoot>, batch_id: u64, merkle_root: [u8; 32]) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.committer.key(),
            ctx.accounts.config.txodds_signer,
            OracleError::Unauthorized
        );
        let c = &mut ctx.accounts.root_commitment;
        c.batch_id = batch_id;
        c.merkle_root = merkle_root;
        c.committed_at = Clock::get()?.unix_timestamp;
        c.committer = ctx.accounts.committer.key();
        ctx.accounts.config.batch_count += 1;
        Ok(())
    }

    /// Permissionless: prove a fixture's result against a committed root, then resolve it.
    pub fn resolve(
        ctx: Context<Resolve>,
        fixture_id: u64,
        outcome: u8,
        score_home: u16,
        score_away: u16,
        _batch_id: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        require!(outcome <= 2, OracleError::BadOutcome);

        let leaf = leaf_hash(fixture_id, outcome, score_home, score_away);
        let computed = process_proof(leaf, &proof);
        require!(
            computed == ctx.accounts.root_commitment.merkle_root,
            OracleError::InvalidProof
        );

        let r = &mut ctx.accounts.resolution;
        r.fixture_id = fixture_id;
        r.outcome = outcome;
        r.score_home = score_home;
        r.score_away = score_away;
        r.batch_id = ctx.accounts.root_commitment.batch_id;
        r.resolved_at = Clock::get()?.unix_timestamp;
        Ok(())
    }
}

// ── Hashing (must match verify.ts) ──────────────────────────────────────────────

fn leaf_hash(fixture_id: u64, outcome: u8, score_home: u16, score_away: u16) -> [u8; 32] {
    let mut buf = Vec::with_capacity(13);
    buf.extend_from_slice(&fixture_id.to_le_bytes());
    buf.push(outcome);
    buf.extend_from_slice(&score_home.to_le_bytes());
    buf.extend_from_slice(&score_away.to_le_bytes());
    keccak::hash(&buf).to_bytes()
}

/// Sorted-pair keccak fold: parent = keccak(min(a,b) ‖ max(a,b)).
fn process_proof(leaf: [u8; 32], proof: &[[u8; 32]]) -> [u8; 32] {
    let mut acc = leaf;
    for sibling in proof {
        let (lo, hi) = if acc <= *sibling { (acc, *sibling) } else { (*sibling, acc) };
        let mut cat = [0u8; 64];
        cat[..32].copy_from_slice(&lo);
        cat[32..].copy_from_slice(&hi);
        acc = keccak::hash(&cat).to_bytes();
    }
    acc
}

// ── Accounts ────────────────────────────────────────────────────────────────────

#[account]
pub struct OracleConfig {
    pub admin: Pubkey,
    pub txodds_signer: Pubkey,
    pub batch_count: u64,
}

#[account]
pub struct RootCommitment {
    pub batch_id: u64,
    pub merkle_root: [u8; 32],
    pub committed_at: i64,
    pub committer: Pubkey,
}

#[account]
pub struct Resolution {
    pub fixture_id: u64,
    pub outcome: u8,
    pub score_home: u16,
    pub score_away: u16,
    pub batch_id: u64,
    pub resolved_at: i64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 32 + 8, seeds = [b"config"], bump)]
    pub config: Account<'info, OracleConfig>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(batch_id: u64)]
pub struct CommitRoot<'info> {
    #[account(mut, seeds = [b"config"], bump)]
    pub config: Account<'info, OracleConfig>,
    #[account(
        init, payer = committer, space = 8 + 8 + 32 + 8 + 32,
        seeds = [b"root", batch_id.to_le_bytes().as_ref()], bump
    )]
    pub root_commitment: Account<'info, RootCommitment>,
    #[account(mut)]
    pub committer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(fixture_id: u64, outcome: u8, score_home: u16, score_away: u16, batch_id: u64)]
pub struct Resolve<'info> {
    #[account(seeds = [b"root", batch_id.to_le_bytes().as_ref()], bump)]
    pub root_commitment: Account<'info, RootCommitment>,
    #[account(
        init, payer = settler, space = 8 + 8 + 1 + 2 + 2 + 8 + 8,
        seeds = [b"res", fixture_id.to_le_bytes().as_ref()], bump
    )]
    pub resolution: Account<'info, Resolution>,
    #[account(mut)]
    pub settler: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum OracleError {
    #[msg("Only the authorised TxODDS signer may commit roots")]
    Unauthorized,
    #[msg("Merkle proof does not fold to the committed root")]
    InvalidProof,
    #[msg("Outcome must be 0 (home), 1 (draw) or 2 (away)")]
    BadOutcome,
}
