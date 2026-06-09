// examples/quote.js — fetch a live SOL → USDT quote from Jupiter (no wallet needed)
//
// Usage: node examples/quote.js

import SolanaSwapProtocol from '../index.js'

const SOL_MINT  = 'So11111111111111111111111111111111111111112'
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

// Minimal read-only account — quoteSwap does not need a private key
const readOnlyAccount = {
  getAddress:      async () => 'FEuTewmn9RdwexQnhvkCq7VaXfpnQL9qsYrTrCgTtk5e',
  keyPair:         null,
  sendTransaction: async () => { throw new Error('read-only account') }
}

const swapper = new SolanaSwapProtocol(readOnlyAccount, { slippageBps: 50 })

async function run () {
  console.log('─'.repeat(56))
  console.log(' @clawdrop/wdk-swap-solana — live quote demo')
  console.log(' Jupiter aggregator · Solana mainnet')
  console.log('─'.repeat(56))

  const pairs = [
    { label: '1 SOL  → USDT', tokenIn: SOL_MINT,  tokenOut: USDT_MINT, amount: 1_000_000_000n, inDecimals: 9, outDecimals: 6  },
    { label: '1 SOL  → USDC', tokenIn: SOL_MINT,  tokenOut: USDC_MINT, amount: 1_000_000_000n, inDecimals: 9, outDecimals: 6  },
    { label: '10 USDC → SOL', tokenIn: USDC_MINT, tokenOut: SOL_MINT,  amount: 10_000_000n,    inDecimals: 6, outDecimals: 9  }
  ]

  for (const pair of pairs) {
    process.stdout.write(`\nQuoting ${pair.label} ...`)
    const quote = await swapper.quoteSwap({
      tokenIn:       pair.tokenIn,
      tokenOut:      pair.tokenOut,
      tokenInAmount: pair.amount
    })

    const inAmt  = Number(quote.tokenInAmount)  / 10 ** pair.inDecimals
    const outAmt = Number(quote.tokenOutAmount) / 10 ** pair.outDecimals
    const fee    = Number(quote.fee)

    console.log(' done')
    console.log(`  in:  ${inAmt.toFixed(pair.inDecimals  > 6 ? 4 : 6)}`)
    console.log(`  out: ${outAmt.toFixed(pair.outDecimals > 6 ? 4 : 6)}`)
    console.log(`  fee: ${fee} lamports`)
  }

  console.log('\n' + '─'.repeat(56))
  console.log(' quoteSwap() ✓  — ready to swap')
  console.log('─'.repeat(56))
}

run().catch(err => { console.error(err.message); process.exit(1) })
