//! PropPool — parametric prop-bet escrow that settles trustlessly by CPI into the
//! deployed TxODDS `txoracle` program's `validate_stat`.
//!
//! UNAUDITED — devnet/testnet-value only. No admin drain path; funds leave a vault
//! only via `claim` (winner, pro-rata), `refund` (unopposed prop), or `close_prop`
//! (empty, expired). The predicate/terms are fixed at `create_prop`; a settler may
//! only supply the proof, never change the bet. A liar's proof fails the CPI and the
//! whole transaction reverts. See PROOF_NOTES.md for the verified proof internals.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::get_return_data;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

// Typed CPI client for the external txoracle program, generated from the IDL at
// `idls/txoracle.json` (address pinned to devnet). Gives us `txoracle::cpi`,
// `txoracle::types::*` and `txoracle::program::Txoracle`.
declare_program!(txoracle);
use txoracle::types::{
    BinaryExpression as OracleBinaryExpression, Comparison as OracleComparison, ProofNode,
    ScoresBatchSummary, StatTerm, TraderPredicate,
};

declare_id!("2APUBCYx5dnPdWpcLB3HMaAhgMM1Vj7ihCCGrhogkZrD");

const MS_PER_DAY: i64 = 86_400_000;

#[program]
pub mod prop_pool {
    use super::*;

    /// Create a prop + its escrow vault. Terms (stat, predicate, bucket) are fixed here.
    pub fn create_prop(ctx: Context<CreateProp>, args: CreatePropArgs) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(args.join_deadline > now, PropError::BadDeadline);
        require!(args.settle_after >= args.join_deadline, PropError::BadDeadline);
        require!(args.min_deposit > 0, PropError::BadAmount);
        if args.stat_key_b.is_some() {
            require!(args.op.is_some(), PropError::BadStatCombo);
        } else {
            require!(args.op.is_none(), PropError::BadStatCombo);
        }

        let p = &mut ctx.accounts.prop;
        p.creator = ctx.accounts.creator.key();
        p.stake_mint = ctx.accounts.stake_mint.key();
        p.nonce = args.nonce;
        p.fixture_id = args.fixture_id;
        p.stat_key = args.stat_key;
        p.period = args.period;
        p.stat_key_b = args.stat_key_b;
        p.op = args.op;
        p.threshold = args.threshold;
        p.comparison = args.comparison;
        p.expected_epoch_day = args.expected_epoch_day;
        p.min_deposit = args.min_deposit;
        p.join_deadline = args.join_deadline;
        p.settle_after = args.settle_after;
        p.status = PropStatus::Open;
        p.total_pool = 0;
        p.over_stake = 0;
        p.under_stake = 0;
        p.winning_side = false;
        p.settled_at = None;
        p.bump = ctx.bumps.prop;
        Ok(())
    }

    /// Deposit `amount` of the stake mint, picking a side. One position per user.
    pub fn join(ctx: Context<Join>, side: bool, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        {
            let p = &ctx.accounts.prop;
            require!(p.status == PropStatus::Open, PropError::NotOpen);
            require!(now < p.join_deadline, PropError::JoinClosed);
            require!(amount >= p.min_deposit, PropError::BadAmount);
        }

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        let p = &mut ctx.accounts.prop;
        p.total_pool = p.total_pool.checked_add(amount).ok_or(PropError::Overflow)?;
        if side {
            p.over_stake = p.over_stake.checked_add(amount).ok_or(PropError::Overflow)?;
        } else {
            p.under_stake = p.under_stake.checked_add(amount).ok_or(PropError::Overflow)?;
        }

        let pos = &mut ctx.accounts.position;
        pos.prop = p.key();
        pos.user = ctx.accounts.user.key();
        pos.side = side;
        pos.stake = amount;
        pos.bump = ctx.bumps.position;
        Ok(())
    }

    /// Permissionless: prove the outcome via txoracle::validate_stat, then lock the result.
    /// The settler supplies only the proof; the predicate/terms come from the stored Prop.
    pub fn settle(
        ctx: Context<Settle>,
        ts: i64,
        fixture_summary: ScoresBatchSummary,
        fixture_proof: Vec<ProofNode>,
        main_tree_proof: Vec<ProofNode>,
        stat_a: StatTerm,
        stat_b: Option<StatTerm>,
        op: Option<OracleBinaryExpression>,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let p = &ctx.accounts.prop;
        require!(p.status == PropStatus::Open, PropError::AlreadySettled);
        require!(now >= p.settle_after, PropError::TooEarly);

        // Bind the supplied proof to THIS prop's terms.
        require!((ts / MS_PER_DAY) as u16 == p.expected_epoch_day, PropError::BucketMismatch);
        require!(fixture_summary.fixture_id == p.fixture_id, PropError::FixtureMismatch);
        require!(
            stat_a.stat_to_prove.key == p.stat_key && stat_a.stat_to_prove.period == p.period,
            PropError::StatMismatch
        );
        match (p.stat_key_b, &stat_b) {
            (Some(kb), Some(sb)) => require!(sb.stat_to_prove.key == kb, PropError::StatMismatch),
            (None, None) => {}
            _ => return err!(PropError::BadStatCombo),
        }
        // op passed to the oracle must equal the stored op (or both absent).
        require!(
            option_binexpr_eq(&op, &p.op),
            PropError::BadStatCombo
        );

        let predicate = TraderPredicate {
            threshold: p.threshold,
            comparison: to_oracle_comparison(p.comparison),
        };

        // CPI into the real oracle. Reverts on an invalid proof.
        let cpi_ctx = CpiContext::new(
            ctx.accounts.txoracle_program.key(),
            txoracle::cpi::accounts::ValidateStat {
                daily_scores_merkle_roots: ctx.accounts.daily_scores_merkle_roots.to_account_info(),
            },
        );
        txoracle::cpi::validate_stat(
            cpi_ctx,
            ts,
            fixture_summary,
            fixture_proof,
            main_tree_proof,
            predicate,
            stat_a,
            stat_b,
            op,
        )?;

        // Read the predicate result the oracle returned (1 byte, 0x01/0x00).
        let (ret_program, data) = get_return_data().ok_or(PropError::NoReturnData)?;
        require_keys_eq!(ret_program, ctx.accounts.txoracle_program.key(), PropError::WrongReturnProgram);
        let predicate_result = data.first().map(|b| *b != 0).unwrap_or(false);

        let p = &mut ctx.accounts.prop;
        if p.over_stake == 0 || p.under_stake == 0 {
            // No counterparty — nobody can win; make it refundable.
            p.status = PropStatus::Refundable;
        } else {
            p.status = PropStatus::Settled;
            p.winning_side = predicate_result;
        }
        p.settled_at = Some(now);
        Ok(())
    }

    /// Winner withdraws their pro-rata share; losers are rejected.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let (payout, seeds_bump, fixture_id, creator, nonce) = {
            let p = &ctx.accounts.prop;
            require!(p.status == PropStatus::Settled, PropError::NotSettled);
            let pos = &ctx.accounts.position;
            require!(pos.side == p.winning_side, PropError::NotAWinner);
            let winning_total = if p.winning_side { p.over_stake } else { p.under_stake };
            require!(winning_total > 0, PropError::NoWinners);
            let payout = ((pos.stake as u128) * (p.total_pool as u128) / (winning_total as u128)) as u64;
            (payout, p.bump, p.fixture_id, p.creator, p.nonce)
        };

        let seeds: &[&[u8]] = &[b"prop", &fixture_id.to_le_bytes(), creator.as_ref(), &nonce.to_le_bytes(), &[seeds_bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.prop.to_account_info(),
                },
                &[seeds],
            ),
            payout,
        )?;
        Ok(())
    }

    /// Unopposed prop: everyone gets their exact stake back.
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let (amount, seeds_bump, fixture_id, creator, nonce) = {
            let p = &ctx.accounts.prop;
            require!(p.status == PropStatus::Refundable, PropError::NotRefundable);
            (ctx.accounts.position.stake, p.bump, p.fixture_id, p.creator, p.nonce)
        };
        let seeds: &[&[u8]] = &[b"prop", &fixture_id.to_le_bytes(), creator.as_ref(), &nonce.to_le_bytes(), &[seeds_bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.prop.to_account_info(),
                },
                &[seeds],
            ),
            amount,
        )?;
        Ok(())
    }
}

// ── Conversions to the oracle's enum types ──────────────────────────────────────
fn to_oracle_comparison(c: Comparison) -> OracleComparison {
    match c {
        Comparison::GreaterThan => OracleComparison::GreaterThan,
        Comparison::LessThan => OracleComparison::LessThan,
        Comparison::EqualTo => OracleComparison::EqualTo,
    }
}

fn option_binexpr_eq(passed: &Option<OracleBinaryExpression>, stored: &Option<BinaryExpr>) -> bool {
    match (passed, stored) {
        (None, None) => true,
        (Some(OracleBinaryExpression::Add), Some(BinaryExpr::Add)) => true,
        (Some(OracleBinaryExpression::Subtract), Some(BinaryExpr::Subtract)) => true,
        _ => false,
    }
}

// ── Args ────────────────────────────────────────────────────────────────────────
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreatePropArgs {
    /// Caller-chosen nonce so a creator can run multiple props per fixture.
    pub nonce: u64,
    pub fixture_id: i64,
    pub stat_key: u32,
    pub period: i32,
    pub stat_key_b: Option<u32>,
    pub op: Option<BinaryExpr>,
    pub threshold: i32,
    pub comparison: Comparison,
    pub expected_epoch_day: u16,
    pub min_deposit: u64,
    pub join_deadline: i64,
    pub settle_after: i64,
    pub creator_side: bool,
}

// ── State ────────────────────────────────────────────────────────────────────────
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PropStatus {
    Open,
    Settled,
    Refundable,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum Comparison {
    GreaterThan,
    LessThan,
    EqualTo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BinaryExpr {
    Add,
    Subtract,
}

#[account]
#[derive(InitSpace)]
pub struct Prop {
    pub creator: Pubkey,
    pub stake_mint: Pubkey,
    pub nonce: u64,
    pub fixture_id: i64,
    pub stat_key: u32,
    pub period: i32,
    pub stat_key_b: Option<u32>,
    pub op: Option<BinaryExpr>,
    pub threshold: i32,
    pub comparison: Comparison,
    pub expected_epoch_day: u16,
    pub min_deposit: u64,
    pub join_deadline: i64,
    pub settle_after: i64,
    pub status: PropStatus,
    pub total_pool: u64,
    pub over_stake: u64,
    pub under_stake: u64,
    pub winning_side: bool,
    pub settled_at: Option<i64>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub prop: Pubkey,
    pub user: Pubkey,
    pub side: bool,
    pub stake: u64,
    pub bump: u8,
}

// ── Contexts ─────────────────────────────────────────────────────────────────────
#[derive(Accounts)]
#[instruction(args: CreatePropArgs)]
pub struct CreateProp<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + Prop::INIT_SPACE,
        seeds = [b"prop", args.fixture_id.to_le_bytes().as_ref(), creator.key().as_ref(), args.nonce.to_le_bytes().as_ref()],
        bump
    )]
    pub prop: Account<'info, Prop>,
    #[account(
        init,
        payer = creator,
        token::mint = stake_mint,
        token::authority = prop,
        seeds = [b"vault", prop.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub stake_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Join<'info> {
    #[account(
        mut,
        seeds = [b"prop", prop.fixture_id.to_le_bytes().as_ref(), prop.creator.as_ref(), prop.nonce.to_le_bytes().as_ref()],
        bump = prop.bump
    )]
    pub prop: Account<'info, Prop>,
    #[account(mut, seeds = [b"vault", prop.key().as_ref()], bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = user,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", prop.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        constraint = user_token_account.mint == prop.stake_mint @ PropError::WrongMint,
        constraint = user_token_account.owner == user.key() @ PropError::WrongOwner
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(
        mut,
        seeds = [b"prop", prop.fixture_id.to_le_bytes().as_ref(), prop.creator.as_ref(), prop.nonce.to_le_bytes().as_ref()],
        bump = prop.bump
    )]
    pub prop: Account<'info, Prop>,
    /// CHECK: the txoracle program self-constrains this account by seeds derived from
    /// `ts` (a mismatched bucket fails with ConstraintSeeds/2006 inside the CPI).
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,
    pub txoracle_program: Program<'info, txoracle::program::Txoracle>,
    #[account(mut)]
    pub settler: Signer<'info>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(
        mut,
        seeds = [b"prop", prop.fixture_id.to_le_bytes().as_ref(), prop.creator.as_ref(), prop.nonce.to_le_bytes().as_ref()],
        bump = prop.bump
    )]
    pub prop: Account<'info, Prop>,
    #[account(mut, seeds = [b"vault", prop.key().as_ref()], bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        close = user,
        seeds = [b"position", prop.key().as_ref(), user.key().as_ref()],
        bump = position.bump,
        constraint = position.user == user.key() @ PropError::WrongOwner
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        constraint = user_token_account.mint == prop.stake_mint @ PropError::WrongMint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(
        mut,
        seeds = [b"prop", prop.fixture_id.to_le_bytes().as_ref(), prop.creator.as_ref(), prop.nonce.to_le_bytes().as_ref()],
        bump = prop.bump
    )]
    pub prop: Account<'info, Prop>,
    #[account(mut, seeds = [b"vault", prop.key().as_ref()], bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        close = user,
        seeds = [b"position", prop.key().as_ref(), user.key().as_ref()],
        bump = position.bump,
        constraint = position.user == user.key() @ PropError::WrongOwner
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        constraint = user_token_account.mint == prop.stake_mint @ PropError::WrongMint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum PropError {
    #[msg("Join deadline must be in the future and <= settle_after")]
    BadDeadline,
    #[msg("Amount below minimum / invalid")]
    BadAmount,
    #[msg("Invalid stat combination (stat_key_b and op must be set together)")]
    BadStatCombo,
    #[msg("Prop is not open")]
    NotOpen,
    #[msg("Join window has closed")]
    JoinClosed,
    #[msg("Prop already settled")]
    AlreadySettled,
    #[msg("Too early to settle")]
    TooEarly,
    #[msg("ts does not map to this prop's root bucket")]
    BucketMismatch,
    #[msg("Fixture id mismatch")]
    FixtureMismatch,
    #[msg("Supplied stat does not match the prop's terms")]
    StatMismatch,
    #[msg("Oracle returned no predicate result")]
    NoReturnData,
    #[msg("Return data came from an unexpected program")]
    WrongReturnProgram,
    #[msg("Prop is not settled")]
    NotSettled,
    #[msg("Prop is not refundable")]
    NotRefundable,
    #[msg("Position is on the losing side")]
    NotAWinner,
    #[msg("No stake on the winning side")]
    NoWinners,
    #[msg("Wrong token mint")]
    WrongMint,
    #[msg("Wrong token account owner")]
    WrongOwner,
    #[msg("Arithmetic overflow")]
    Overflow,
}
