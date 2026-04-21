#!/usr/bin/env node
/**
 * Payment verification without Helius - uses Solana devnet RPC directly
 */
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

const DEVNET_RPC = 'https://api.devnet.solana.com';
const PAYMENT_WALLET = '3TyBTeqqN5NpMicX6JXAVAHqUyYLqSNz4EMtQxM34yMw';

async function verifyPayment(txHash, expectedAmount) {
  const connection = new Connection(DEVNET_RPC, 'confirmed');
  
  try {
    // Get transaction
    const tx = await connection.getTransaction(txHash, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx) {
      return { verified: false, error: 'Transaction not found' };
    }
    
    if (tx.meta.err) {
      return { verified: false, error: 'Transaction failed on-chain' };
    }
    
    // Parse instructions to find SOL transfer to payment wallet
    const message = tx.transaction.message;
    const accountKeys = message.getAccountKeys();
    
    let receivedAmount = 0;
    
    // Look through all instructions for System Program transfers
    for (const ix of message.compiledInstructions) {
      const programId = accountKeys.get(ix.programIdIndex).toString();
      
      // System Program = 11111111111111111111111111111111
      if (programId === '11111111111111111111111111111111') {
        // System transfer instruction data: first byte = discriminator (2 = Transfer)
        const data = Buffer.from(ix.data);
        
        if (data.length >= 12 && data[0] === 2) {
          // Parse lamports from instruction data (little-endian u64 at offset 4)
          const lamports = data.readBigUInt64LE(4);
          const amount = Number(lamports) / LAMPORTS_PER_SOL;
          
          // Check if recipient is payment wallet
          const recipientIndex = ix.accountKeyIndexes[1];
          const recipient = accountKeys.get(recipientIndex).toString();
          
          if (recipient === PAYMENT_WALLET) {
            receivedAmount += amount;
          }
        }
      }
    }
    
    // Also check inner instructions (CPI calls)
    if (tx.meta.innerInstructions) {
      for (const inner of tx.meta.innerInstructions) {
        for (const ix of inner.instructions) {
          const programId = accountKeys.get(ix.programIdIndex).toString();
          
          if (programId === '11111111111111111111111111111111') {
            const data = Buffer.from(ix.data, 'base64');
            
            if (data.length >= 12 && data[0] === 2) {
              const lamports = data.readBigUInt64LE(4);
              const amount = Number(lamports) / LAMPORTS_PER_SOL;
              
              const recipientIndex = ix.accountKeyIndexes[1];
              const recipient = accountKeys.get(recipientIndex).toString();
              
              if (recipient === PAYMENT_WALLET) {
                receivedAmount += amount;
              }
            }
          }
        }
      }
    }
    
    // Allow 10% tolerance
    const minAmount = expectedAmount * 0.9;
    
    if (receivedAmount >= minAmount) {
      return { 
        verified: true, 
        amount: receivedAmount,
        tx: txHash 
      };
    } else {
      return { 
        verified: false, 
        error: `Expected ${expectedAmount} SOL, found transfer of ${receivedAmount.toFixed(4)} SOL to payment wallet` 
      };
    }
    
  } catch (err) {
    return { verified: false, error: err.message };
  }
}

// CLI usage
if (require.main === module) {
  const txHash = process.argv[2];
  const expectedAmount = parseFloat(process.argv[3]) || 0.11;
  
  if (!txHash) {
    console.log('Usage: node verify-payment-no-helius.js <tx-hash> [expected-amount]');
    process.exit(1);
  }
  
  verifyPayment(txHash, expectedAmount).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.verified ? 0 : 1);
  });
}

module.exports = { verifyPayment };
