/**
 * H2: KeypairWallet Abstraction
 * Decouples agent keypairs from user wallets.
 * Pattern adapted from sendaifun/solana-agent-kit.
 */

import { Keypair, PublicKey, Transaction, VersionedTransaction, Connection } from '@solana/web3.js';
import logger from '../utils/logger.js';

export interface IWallet {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

export class KeypairWallet implements IWallet {
  readonly publicKey: PublicKey;
  private readonly keypair: Keypair;
  readonly connection: Connection;

  constructor(keypair: Keypair, rpcUrl: string) {
    this.keypair = keypair;
    this.publicKey = keypair.publicKey;
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) {
      tx.sign(this.keypair);
    } else {
      tx.sign([this.keypair]);
    }
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map(tx => this.signTransaction(tx)));
  }

  toBase58(): string { return this.keypair.publicKey.toBase58(); }
}

export class ReadOnlyWallet implements IWallet {
  readonly publicKey: PublicKey;
  constructor(address: string) { this.publicKey = new PublicKey(address); }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    throw new Error('ReadOnlyWallet cannot sign transactions');
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    throw new Error('ReadOnlyWallet cannot sign transactions');
  }
}

// Per-agent ephemeral keypair registry
const agentKeypairs = new Map<string, Keypair>();

export function getOrCreateAgentKeypair(agent_id: string): Keypair {
  if (!agentKeypairs.has(agent_id)) {
    const kp = Keypair.generate();
    agentKeypairs.set(agent_id, kp);
    logger.info({ agent_id, pubkey: kp.publicKey.toBase58() }, 'Generated agent keypair');
  }
  return agentKeypairs.get(agent_id)!;
}

export function getAgentWallet(agent_id: string, rpcUrl: string): KeypairWallet {
  return new KeypairWallet(getOrCreateAgentKeypair(agent_id), rpcUrl);
}

export function getAgentPublicKey(agent_id: string): string {
  return getOrCreateAgentKeypair(agent_id).publicKey.toBase58();
}

export function walletFromPrivateKey(b64: string, rpcUrl: string): KeypairWallet {
  return new KeypairWallet(Keypair.fromSecretKey(Buffer.from(b64, 'base64')), rpcUrl);
}
