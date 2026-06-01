import { AceDataCloud } from '@acedatacloud/sdk';
import { createX402PaymentHandler } from '@acedatacloud/x402-client';
import { Connection, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import { buildSignerFromPrivateKey } from './x402-payments.js';
import { loadConfig } from '../config.js';

// Thread-local storage for the last x402 tx signature captured during a payment.
let _lastX402Signature: string | null = null;

// Global semaphore — Synapse RPC free tier can only handle one getRecentBlockhash at a time.
// Queue x402 payments so they don't race each other and hit 429.
let _paymentQueue: Promise<void> = Promise.resolve();
function enqueuePayment<T>(fn: () => Promise<T>): Promise<T> {
  const result = _paymentQueue.then(fn);
  _paymentQueue = result.then(() => {}, () => {});
  return result;
}

export function getAndClearLastX402Signature(): string | null {
  const sig = _lastX402Signature;
  _lastX402Signature = null;
  return sig;
}

export function createAceClient(): AceDataCloud {
  const config = loadConfig();
  const keypair = buildSignerFromPrivateKey(config.walletPrivateKey);
  // Bounty requirement: x402 payments must use Synapse RPC, not generic mainnet RPC
  const connection = new Connection(config.synapseRpcUrl, 'confirmed');

  // Do NOT pass apiToken — that bypasses x402 and uses credit-based auth.
  // Without a token the API returns 402, the payment handler pays USDC on Solana,
  // and the on-chain tx signature is recorded for the bounty proof.
  return new AceDataCloud({
    paymentHandler: createX402PaymentHandler({
      network: 'solana',
      solanaWallet: {
        publicKey: keypair.publicKey,
        async signAndSendTransaction(tx: Transaction) {
          // Serialise through queue — prevents concurrent getRecentBlockhash calls
          // that exhaust the Synapse RPC free-tier rate limit
          return enqueuePayment(async () => {
            const signature = await sendAndConfirmTransaction(connection, tx, [keypair]);
            _lastX402Signature = signature;
            console.info(`[x402] Payment confirmed: ${signature}`);
            return signature;
          });
        },
      },
    }) as unknown as import('@acedatacloud/sdk').PaymentHandler,
  });
}
