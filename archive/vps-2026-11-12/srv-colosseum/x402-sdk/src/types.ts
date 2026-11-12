export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" as const;
export const SOLANA_DEVNET  = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" as const;
export const USDC_MAINNET   = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as const;
export const USDC_DEVNET    = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" as const;

export type SolanaNetwork = typeof SOLANA_MAINNET | typeof SOLANA_DEVNET;

export interface PaymentConfig {
  /** Amount in atomic USDC units (6 decimals — $1.00 = 1_000_000n) */
  amount: bigint;
  /** Solana wallet address to receive payment */
  payTo: string;
  /** Solana RPC URL (Helius recommended for fast verification) */
  rpcUrl: string;
  /** Human-readable description shown in 402 challenge */
  description?: string;
  /** USDC mint address. Defaults to mainnet USDC. */
  mint?: string;
  /** Network identifier. Defaults to mainnet. */
  network?: SolanaNetwork;
  /**
   * Replay protection store. Defaults to in-memory (lost on restart).
   * Pass a RedisReplayStore for persistent protection.
   */
  replayStore?: ReplayStore;
}

export interface VerifyResult {
  ok:      boolean;
  error?:  string;
  amount?: number;
  from?:   string;
}

export interface X402Challenge {
  x402Version: number;
  resource:    { url: string; description: string; mimeType: string };
  accepts:     X402Accept[];
}

export interface X402Accept {
  scheme:            string;
  network:           string;
  amount:            string;
  asset:             string;
  payTo:             string;
  maxTimeoutSeconds: number;
  extra:             Record<string, unknown>;
}

/** Minimal interface for replay protection — implement with Redis, SQLite, etc. */
export interface ReplayStore {
  /** Returns true if the sig was not yet seen (and records it). Returns false on replay. */
  claim(txSig: string): Promise<boolean>;
  /** Remove a sig (called when verification fails so user can retry with correct tx) */
  release(txSig: string): Promise<void>;
}

/** Populated on req.solanaPayment after successful middleware */
export interface SolanaPayment {
  txSig:         string;
  amount:        number;
  from:          string;
  agentDiscount: boolean;
}

declare global {
  namespace Express {
    interface Request {
      solanaPayment?: SolanaPayment;
    }
  }
}
