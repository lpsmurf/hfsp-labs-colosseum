// Phantom wallet browser extension type declarations

interface PhantomSignMessageResult {
  signature: Uint8Array;
  publicKey: { toBase58(): string };
}

interface PhantomProvider {
  isPhantom: boolean;
  publicKey: { toBase58(): string } | null;
  isConnected: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array, encoding: 'utf8' | 'hex'): Promise<PhantomSignMessageResult>;
}

interface Window {
  solana?: PhantomProvider;
}
