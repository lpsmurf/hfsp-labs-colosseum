import { AceDataCloud } from '@acedatacloud/sdk';
import { createX402PaymentHandler } from '@acedatacloud/x402-client';
import { Connection, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import { buildSignerFromPrivateKey } from './x402-payments.js';
import { loadConfig } from '../config.js';

// Thread-local storage for the last x402 tx signature captured during a payment.
// Set by the signAndSendTransaction hook; read by extractX402Hash immediately after each API call.
let _lastX402Signature: string | null = null;

export function getAndClearLastX402Signature(): string | null {
  const sig = _lastX402Signature;
  _lastX402Signature = null;
  return sig;
}

export function createAceClient(): AceDataCloud {
  const config = loadConfig();
  const keypair = buildSignerFromPrivateKey(config.walletPrivateKey);
  const connection = new Connection(config.solanaMainnetRpc, 'confirmed');

  return new AceDataCloud({
    apiToken: config.aceDataApiKey,
    paymentHandler: createX402PaymentHandler({
      network: 'solana',
      solanaWallet: {
        publicKey: keypair.publicKey,
        async signAndSendTransaction(tx: Transaction) {
          const signature = await sendAndConfirmTransaction(connection, tx, [keypair]);
          // Capture the signature so extractX402Hash can pick it up
          _lastX402Signature = signature;
          console.info(`[x402] Payment confirmed: ${signature}`);
          return signature;
        },
      },
    }) as unknown as import('@acedatacloud/sdk').PaymentHandler,
  });
}
