import { Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, Keypair } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

const HELIUS_RPC = process.env.HELIUS_DEVNET_RPC || 'https://devnet.helius-rpc.com/';
const HELIUS_KEY = process.env.HELIUS_API_KEY;

const rpcUrl = HELIUS_KEY ? `${HELIUS_RPC}?api-key=${HELIUS_KEY}` : HELIUS_RPC;
const connection = new Connection(rpcUrl, 'confirmed');

export interface PaymentResult {
  success: boolean;
  signature?: string;
  error?: string;
}

export async function sendDevnetPayment(
  recipientAddress: string,
  amountSol: number
): Promise<PaymentResult> {
  try {
    // Load wallet
    const walletPath = path.join(process.cwd(), 'devnet-wallet.json');
    if (!fs.existsSync(walletPath)) {
      return { success: false, error: 'Devnet wallet not found. Run create-wallet first.' };
    }
    
    const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(walletData.secretKey));
    
    console.log('Sending from:', keypair.publicKey.toString());
    console.log('To:', recipientAddress);
    console.log('Amount:', amountSol, 'SOL');
    
    // Create transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(recipientAddress),
        lamports: amountSol * 1e9, // Convert SOL to lamports
      })
    );
    
    // Send and confirm
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: 'confirmed' }
    );
    
    console.log('Transaction confirmed:', signature);
    return { success: true, signature };
  } catch (error) {
    console.error('Payment failed:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getBalance(address: string): Promise<number> {
  try {
    const publicKey = new PublicKey(address);
    const balance = await connection.getBalance(publicKey);
    return balance / 1e9; // Convert lamports to SOL
  } catch (error) {
    console.error('Failed to get balance:', error);
    return 0;
  }
}
