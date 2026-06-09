// examples/swap.js — execute a real USDC → SOL swap on Solana mainnet
//
// Usage:
//   PRIVATE_KEY=<base58> RPC_URL=<helius-url> node examples/swap.js
//
// PRIVATE_KEY  — base58-encoded Solana wallet private key (64 bytes)
// RPC_URL      — Solana RPC endpoint (Helius recommended for reliability)
// AMOUNT_USDC  — USDC to sell (default: 1)

import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import SolanaSwapProtocol from '../index.js'

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const SOL_MINT  = 'So11111111111111111111111111111111111111112'

async function run () {
  const privateKeyB58 = process.env.PRIVATE_KEY
  const rpcUrl        = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com'
  const amountUsdc    = parseFloat(process.env.AMOUNT_USDC || '1')

  if (!privateKeyB58) {
    console.error('Error: PRIVATE_KEY env var required (base58 Solana private key)')
    process.exit(1)
  }

  const keypair      = Keypair.fromSecretKey(bs58.decode(privateKeyB58))
  const amountAtomic = BigInt(Math.round(amountUsdc * 1e6)) // USDC has 6 decimals

  // WDK-compatible account wrapping the keypair
  const account = {
    getAddress:      async () => keypair.publicKey.toBase58(),
    keyPair:         { publicKey: keypair.publicKey.toBytes(), privateKey: keypair.secretKey },
    sendTransaction: async () => {}
  }

  const swapper = new SolanaSwapProtocol(account, {
    rpcUrl,
    slippageBps: 50,
    swapMaxFee:  100_000n  // refuse if platform fee > 0.0001 SOL
  })

  console.log('─'.repeat(60))
  console.log(' @clawdrop/wdk-swap-solana — live swap demo')
  console.log(' Jupiter aggregator · Solana mainnet')
  console.log('─'.repeat(60))
  console.log(`\n Wallet:  ${keypair.publicKey.toBase58()}`)
  console.log(` Selling: ${amountUsdc} USDC`)
  console.log(` Buying:  SOL`)

  // Step 1: quote
  process.stdout.write('\n[1/3] Fetching Jupiter quote ...')
  const quote = await swapper.quoteSwap({
    tokenIn:       USDC_MINT,
    tokenOut:      SOL_MINT,
    tokenInAmount: amountAtomic
  })
  const outSol = (Number(quote.tokenOutAmount) / 1e9).toFixed(6)
  console.log(' done')
  console.log(`      Expected out: ${outSol} SOL`)
  console.log(`      Platform fee: ${quote.fee} lamports`)

  // Step 2: execute
  process.stdout.write('\n[2/3] Signing and broadcasting transaction ...')
  const result = await swapper.swap({
    tokenIn:       USDC_MINT,
    tokenOut:      SOL_MINT,
    tokenInAmount: amountAtomic
  })
  console.log(' done')

  // Step 3: result
  const actualSol = (Number(result.tokenOutAmount) / 1e9).toFixed(6)
  console.log('\n[3/3] Swap confirmed ✓')
  console.log(`      Sold:     ${amountUsdc} USDC`)
  console.log(`      Received: ${actualSol} SOL`)
  console.log(`      Tx hash:  ${result.hash}`)
  console.log(`      Explorer: https://solscan.io/tx/${result.hash}`)
  console.log('\n' + '─'.repeat(60))
}

run().catch(err => { console.error('\nError:', err.message); process.exit(1) })
