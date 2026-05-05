import type { Connection, SendOptions, Transaction } from '@solana/web3.js';

export interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: { toBase58: () => string };
  isConnected?: boolean;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toBase58: () => string } }>;
  signMessage: (message: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
  sendTransaction?: (
    transaction: Transaction,
    connection: Connection,
    options?: SendOptions
  ) => Promise<string>;
  signAndSendTransaction?: (transaction: Transaction) => Promise<string | { signature: string }>;
}

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}
