import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { X402Challenge } from "../types.js";
import { USDC_MAINNET } from "../types.js";

export interface X402ClientConfig {
  /** Keypair used to sign and pay for transactions */
  wallet: Keypair;
  /** Solana RPC URL (Helius recommended) */
  rpcUrl: string;
}

interface ParsedChallenge {
  payTo:  string;
  amount: bigint;
  mint:   string;
}

/**
 * HTTP client that handles the x402 payment loop automatically.
 *
 * @example
 * ```ts
 * import { X402Client } from '@hfsp/x402-sdk/client';
 * import { Keypair } from '@solana/web3.js';
 *
 * const client = new X402Client({
 *   wallet: Keypair.fromSecretKey(secretKey),
 *   rpcUrl: process.env.HELIUS_RPC_URL,
 * });
 *
 * // Automatically pays $0.50 when the server returns 402
 * const res = await client.fetch('https://api.example.com/api/analyze', {
 *   method: 'POST',
 *   body:   JSON.stringify({ input: 'hello' }),
 * });
 * const data = await res.json();
 * ```
 */
export class X402Client {
  private readonly connection: Connection;

  constructor(private readonly config: X402ClientConfig) {
    this.connection = new Connection(config.rpcUrl, "confirmed");
  }

  /**
   * Drop-in replacement for `fetch` that handles the 402 → pay → retry loop.
   * On a 402 response, parses the payment challenge, sends USDC, then retries once.
   */
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const firstRes = await fetch(url, init);

    if (firstRes.status !== 402) return firstRes;

    const body      = await firstRes.json() as any;
    const challenge = this.parseChallenge(firstRes.headers, body);

    if (!challenge) {
      throw new Error("x402: received 402 but could not parse payment challenge");
    }

    const txSig = await this.pay(challenge);

    // Normalize init.headers — it may be a Headers instance, an array of
    // tuples, or a plain object. Spreading a Headers instance loses everything.
    const baseHeaders: Record<string, string> = {};
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => { baseHeaders[key] = value; });
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) baseHeaders[key] = value;
    } else if (init.headers) {
      Object.assign(baseHeaders, init.headers as Record<string, string>);
    }

    const retryInit: RequestInit = {
      ...init,
      headers: {
        ...baseHeaders,
        "X-Solana-Tx": txSig,
      },
    };

    return fetch(url, retryInit);
  }

  private parseChallenge(
    headers: Headers,
    body: any,
  ): ParsedChallenge | null {
    // Try PAYMENT-REQUIRED header (base64 JSON) first
    const encoded = headers.get("PAYMENT-REQUIRED") ?? headers.get("payment-required");
    if (encoded) {
      try {
        const challenge = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as X402Challenge;
        const accept    = challenge.accepts.find(a => a.scheme === "exact");
        if (accept) {
          return { payTo: accept.payTo, amount: BigInt(accept.amount), mint: accept.asset };
        }
      } catch { /* fall through to body parse */ }
    }

    // Fall back to body.pay (our extended response shape)
    if (body?.pay?.payTo && body?.pay?.amount) {
      return {
        payTo:  body.pay.payTo,
        amount: BigInt(body.pay.amount),
        mint:   body.pay.mint ?? USDC_MAINNET,
      };
    }

    return null;
  }

  private async pay(challenge: ParsedChallenge): Promise<string> {
    const { wallet, connection } = { wallet: this.config.wallet, connection: this.connection };
    const mint    = new PublicKey(challenge.mint);
    const payTo   = new PublicKey(challenge.payTo);

    // Only create OUR OWN token account — never the recipient's, which would
    // bill the payer ~0.002 SOL of rent to provision someone else's account.
    const senderAta = await getOrCreateAssociatedTokenAccount(connection, wallet, mint, wallet.publicKey);

    const receiverAtaAddress = await getAssociatedTokenAddress(mint, payTo);
    try {
      await getAccount(connection, receiverAtaAddress);
    } catch {
      throw new Error(
        `x402: recipient ${payTo.toBase58()} has no token account for mint ${mint.toBase58()}. ` +
        `Refusing to create it at the payer's expense — the service must provision its own receiving account.`,
      );
    }

    const tx = new Transaction().add(
      createTransferInstruction(
        senderAta.address,
        receiverAtaAddress,
        wallet.publicKey,
        challenge.amount,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
    return sig;
  }
}
