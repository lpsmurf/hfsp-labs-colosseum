// examples/swap.js — execute a real SOL → USDT swap on Solana mainnet
//
// Usage:
//   PRIVATE_KEY=<base58> RPC_URL=<helius-url> node examples/swap.js
//
// PRIVATE_KEY  — base58-encoded Solana wallet private key (64 bytes)
// RPC_URL      — Solana RPC endpoint (Helius recommended for reliability)
// AMOUNT_SOL   — amount of SOL to swap (default: 0.001)

import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import SolanaSwapProtocol from '../index.js'

const SOL_MINT  = 'So11111111111111111111111111111111111111112'
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

async function run () {
  const privateKeyB58 = process.env.PRIVATE_KEY
  const rpcUrl        = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com'
  const amountSol     = parseFloat(process.env.AMOUNT_SOL || '0.001')

  if (!privateKeyB58) {
    console.error('Error: PRIVATE_KEY env var required (base58 Solana private key)')
    process.exit(1)
  }

  const keypair    = Keypair.fromSecretKey(bs58.decode(privateKeyB58))
  const amountLamp = BigInt(Math.round(amountSol * 1e9))

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
  console.log(` Selling: ${amountSol} SOL`)
  console.log(` Buying:  USDT`)

  // Step 1: quote
  process.stdout.write('\n[1/3] Fetching Jupiter quote ...')
  const quote = await swapper.quoteSwap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT, tokenInAmount: amountLamp })
  const outUsdt = (Number(quote.tokenOutAmount) / 1e6).toFixed(6)
  console.log(` done`)
  console.log(`      Expected out: ${outUsdt} USDT`)
  console.log(`      Platform fee: ${quote.fee} lamports`)

  // Step 2: execute
  process.stdout.write('\n[2/3] Signing and broadcasting transaction ...')
  const result = await swapper.swap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT, tokenInAmount: amountLamp })
  console.log(` done`)

  // Step 3: result
  const actualOut = (Number(result.tokenOutAmount) / 1e6).toFixed(6)
  console.log(`\n[3/3] Swap confirmed ✓`)
  console.log(`      Sold:     ${amountSol} SOL`)
  console.log(`      Received: ${actualOut} USDT`)
  console.log(`      Tx hash:  ${result.hash}`)
  console.log(`      Explorer: https://solscan.io/tx/${result.hash}`)
  console.log('\n' + '─'.repeat(60))
}

run().catch(err => { console.error('\nError:', err.message); process.exit(1) })
