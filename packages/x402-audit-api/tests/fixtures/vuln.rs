use anchor_lang::prelude::*;
use solana_program::account_info::next_account_info;

#[program]
pub mod vault {
    use super::*;
    pub fn withdraw2(ctx: Context<Withdraw>) -> Result<()> { let a = next_account_info(&mut iter)?; Ok(()) }
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let clock = Clock::from_account_info(&ctx.accounts.clock)?;
        let state = VaultState::try_from_slice(&ctx.accounts.state.data.borrow())?;
        ctx.accounts.vault.balance = ctx.accounts.vault.balance - amount;
        invoke(&ix, &[ctx.accounts.token_program.clone()])?;
        **ctx.accounts.state.lamports.borrow_mut() = 0;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub authority: AccountInfo<'info>,
    #[account(mut)]
    pub token_acct: Account<'info, TokenAccount>,
    pub clock: AccountInfo<'info>,
}
