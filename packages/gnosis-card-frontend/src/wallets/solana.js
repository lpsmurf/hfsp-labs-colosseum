// Phantom wallet integration — connect + send a USDC SPL transfer.
import {
  Connection,
  PublicKey,
  Transaction
} from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction
} from '@solana/spl-token'
import { SOLANA_RPC, SOLANA_USDC_MINT } from '../config.js'

const USDC_DECIMALS = 6

function getProvider () {
  const provider = window.phantom?.solana ?? window.solana
  if (!provider?.isPhantom) {
    throw new Error('Phantom wallet not found. Install it from phantom.app')
  }
  return provider
}

/** Connect to Phantom; returns the base58 public key. */
export async function connectSolana () {
  const provider = getProvider()
  const { publicKey } = await provider.connect()
  return publicKey.toBase58()
}

/**
 * Send `amount` USDC to `payTo`. Returns the confirmed tx signature.
 * Phantom signs + broadcasts; we build the transfer instruction.
 */
export async function sendUsdcSolana ({ payTo, amount }) {
  const provider = getProvider()
  const connection = new Connection(SOLANA_RPC, 'confirmed')

  const owner = new PublicKey(provider.publicKey.toString())
  const mint = new PublicKey(SOLANA_USDC_MINT)
  const recipient = new PublicKey(payTo)

  const fromAta = await getAssociatedTokenAddress(mint, owner)
  const toAta = await getAssociatedTokenAddress(mint, recipient)

  const atomic = BigInt(Math.round(amount * 10 ** USDC_DECIMALS))

  const tx = new Transaction()
  // Idempotent — no-op if the recipient ATA already exists (it normally does).
  tx.add(createAssociatedTokenAccountIdempotentInstruction(owner, toAta, recipient, mint))
  tx.add(createTransferCheckedInstruction(fromAta, mint, toAta, owner, atomic, USDC_DECIMALS))

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  tx.recentBlockhash = blockhash
  tx.feePayer = owner

  const { signature } = await provider.signAndSendTransaction(tx)
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')

  return signature
}
