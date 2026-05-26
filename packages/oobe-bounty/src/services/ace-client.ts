import { AceDataCloud } from '@acedatacloud/sdk';
import { createX402PaymentHandler } from '@acedatacloud/x402-client';
import { Connection, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import { buildSignerFromPrivateKey } from './x402-payments.js';
import { loadConfig } from '../config.js';

export function createAceClient(): AceDataCloud {
  const config = loadConfig();
  const keypair = buildSignerFromPrivateKey(config.walletPrivateKey);
  const connection = new Connection(config.solanaMainnetRpc, 'confirmed');

  // The AceDataCloud SDK and x402-client have slightly divergent PaymentRequirement
  // types (maxTimeoutSeconds optional vs required); the cast resolves the mismatch.
  return new AceDataCloud({
    apiToken: config.aceDataApiKey,
    paymentHandler: createX402PaymentHandler({
      network: 'solana',
      solanaWallet: {
        publicKey: keypair.publicKey,
        async signAndSendTransaction(tx: Transaction) {
          return sendAndConfirmTransaction(connection, tx, [keypair]);
        },
      },
    }) as unknown as import('@acedatacloud/sdk').PaymentHandler,
  });
}
