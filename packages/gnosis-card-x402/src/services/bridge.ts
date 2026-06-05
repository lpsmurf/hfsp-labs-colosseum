/**
 * Relay.link bridge — direct Solana USDC → Gnosis Chain USDCe in ~5 seconds.
 *
 * Flow:
 *   1. getQuote()            — get fee breakdown + Solana tx instructions
 *   2. createAndSubmitOrder() — build versioned tx from instructions, sign, submit
 *   3. getOrderStatus()       — poll /intents/status until fulfilled
 *
 * Our server wallet receives x402 USDC and immediately bridges it to the
 * user's Gnosis Safe. No intermediary chains.
 */

import {
  Connection,
  VersionedTransaction,
  TransactionMessage,
  TransactionInstruction,
  AddressLookupTableAccount,
  PublicKey,
  Keypair,
} from '@solana/web3.js';
import { ethers } from 'ethers';
import bs58 from 'bs58';
import {
  config, GNOSIS_TOKENS, USDC_MINT, BASE_USDC,
  HELIUS_RPC, BASE_CHAIN_ID, SOLANA_CHAIN_ID, GNOSIS_CHAIN_ID,
  type GnosisToken, type SourceChain,
} from '../config.js';

const RELAY_API = config.RELAY_API_URL;

export interface BridgeQuote {
  srcAmountUsdc:       number;
  dstAmountFormatted:  number;
  dstToken:            GnosisToken;
  dstTokenAddress:     string;
  bridgeFeeUsdc:       number;
  ourFeeUsdc:          number;
  estimatedFillTimeMs: number;
  sourceChain:         SourceChain;
}

export interface BridgeOrder {
  orderId:    string;
  status:     'pending' | 'fulfilled' | 'failed';
  srcTxHash?: string;
  dstTxHash?: string;
  createdAt:  number;
  requestId?: string;
}

function getSolanaKeypair(): Keypair {
  return Keypair.fromSecretKey(bs58.decode(config.WALLET_PRIVATE_KEY));
}

function getEvmWallet(): ethers.Wallet {
  return new ethers.Wallet(config.EVM_WALLET_PRIVATE_KEY);
}

interface RelayQuoteResponse {
  steps: Array<{
    id: string;
    items: Array<{
      status: string;
      data: {
        instructions: Array<{
          programId: string;
          keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
          data: number[];
        }>;
        addressLookupTableAddresses: string[];
      };
      check: { endpoint: string; method: string };
    }>;
  }>;
  fees: {
    relayerService: { amountFormatted: string };
    relayerGas:     { amountFormatted: string };
  };
  details: {
    currencyOut:  { amount: string; amountFormatted: string };
    timeEstimate: number;
  };
  protocol: {
    v2: { orderId: string };
  };
}

async function relayQuote(opts: {
  srcAmountRaw:  string;
  dstToken:      GnosisToken;
  safeAddress:   string;
  senderWallet:  string;
  sourceChain:   SourceChain;
}): Promise<RelayQuoteResponse> {
  const originChainId   = opts.sourceChain === 'base' ? BASE_CHAIN_ID : SOLANA_CHAIN_ID;
  const originCurrency  = opts.sourceChain === 'base' ? BASE_USDC     : USDC_MINT;

  const res = await fetch(`${RELAY_API}/quote`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user:                 opts.senderWallet,
      originChainId,
      destinationChainId:   GNOSIS_CHAIN_ID,
      originCurrency,
      destinationCurrency:  GNOSIS_TOKENS[opts.dstToken],
      amount:               opts.srcAmountRaw,
      recipient:            opts.safeAddress,
      tradeType:            'EXACT_INPUT',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Relay.link quote failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<RelayQuoteResponse>;
}

export async function getQuote(opts: {
  srcAmountUsdc: number;
  dstToken:      GnosisToken;
  safeAddress:   string;
  sourceChain?:  SourceChain;
}): Promise<BridgeQuote> {
  const { srcAmountUsdc, dstToken, safeAddress, sourceChain = 'solana' } = opts;
  const feePct     = parseFloat(config.TOPUP_FEE_PCT) / 100;
  const ourFeeUsdc = parseFloat((srcAmountUsdc * feePct).toFixed(6));
  const bridgeAmt  = srcAmountUsdc - ourFeeUsdc;
  const srcRaw     = Math.round(bridgeAmt * 1_000_000).toString();

  const senderWallet = sourceChain === 'base'
    ? config.EVM_WALLET_ADDRESS
    : getSolanaKeypair().publicKey.toBase58();

  const data = await relayQuote({ srcAmountRaw: srcRaw, dstToken, safeAddress, senderWallet, sourceChain });

  const relayFee   = parseFloat(data.fees.relayerService.amountFormatted ?? '0');
  const gasFee     = parseFloat(data.fees.relayerGas.amountFormatted ?? '0');

  return {
    srcAmountUsdc,
    dstAmountFormatted:  parseFloat(data.details.currencyOut.amountFormatted),
    dstToken,
    dstTokenAddress:     GNOSIS_TOKENS[dstToken],
    bridgeFeeUsdc:       parseFloat((relayFee + gasFee).toFixed(6)),
    ourFeeUsdc,
    estimatedFillTimeMs: (data.details.timeEstimate ?? 5) * 1000,
    sourceChain,
  };
}

export async function createAndSubmitOrder(opts: {
  srcAmountUsdc: number;
  dstToken:      GnosisToken;
  safeAddress:   string;
  sourceChain?:  SourceChain;
}): Promise<BridgeOrder> {
  const { srcAmountUsdc, dstToken, safeAddress, sourceChain = 'solana' } = opts;
  const feePct    = parseFloat(config.TOPUP_FEE_PCT) / 100;
  const bridgeAmt = srcAmountUsdc * (1 - feePct);
  const srcRaw    = Math.round(bridgeAmt * 1_000_000).toString();

  const senderWallet = sourceChain === 'base'
    ? config.EVM_WALLET_ADDRESS
    : getSolanaKeypair().publicKey.toBase58();

  const quote = await relayQuote({ srcAmountRaw: srcRaw, dstToken, safeAddress, senderWallet, sourceChain });

  const step = quote.steps.find(s => s.id === 'deposit');
  if (!step?.items[0]?.data) throw new Error('Relay.link returned no deposit step');

  let signature: string;

  if (sourceChain === 'base') {
    // ── Base EVM path ──────────────────────────────────────────────────────────
    const evmWallet  = getEvmWallet();
    const provider   = new ethers.JsonRpcProvider(config.BASE_RPC_URL);
    const signer     = evmWallet.connect(provider);

    // Relay.link returns EVM tx data under steps[0].items[0].data for EVM chains
    const txData = step.items[0].data as unknown as {
      to: string; data: string; value: string; chainId: number;
    };

    const tx = await signer.sendTransaction({
      to:      txData.to,
      data:    txData.data,
      value:   BigInt(txData.value ?? '0'),
      chainId: txData.chainId ?? BASE_CHAIN_ID,
    });

    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1) throw new Error('Base transaction failed');
    signature = tx.hash;

  } else {
    // ── Solana path ────────────────────────────────────────────────────────────
    const keypair    = getSolanaKeypair();
    const connection = new Connection(HELIUS_RPC, 'confirmed');
    const { instructions: rawInstructions, addressLookupTableAddresses } = step.items[0].data;

    const altAccounts: AddressLookupTableAccount[] = [];
    for (const addr of addressLookupTableAddresses ?? []) {
      const res = await connection.getAddressLookupTable(new PublicKey(addr));
      if (res.value) altAccounts.push(res.value);
    }

    const instructions: TransactionInstruction[] = rawInstructions.map(ix => new TransactionInstruction({
      programId: new PublicKey(ix.programId),
      keys:      ix.keys.map(k => ({
        pubkey:     new PublicKey(k.pubkey),
        isSigner:   k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(typeof ix.data === 'string' ? ix.data : Buffer.from(ix.data).toString('hex'), 'hex'),
    }));

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const message = new TransactionMessage({
      payerKey:        keypair.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message(altAccounts);

    const solTx = new VersionedTransaction(message);
    solTx.sign([keypair]);

    signature = await connection.sendRawTransaction(solTx.serialize(), { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction(signature, 'confirmed');
  }

  // Use the check endpoint requestId for status polling (not the protocol orderId)
  const checkEndpoint = quote.steps[0]?.items[0]?.check?.endpoint ?? '';
  const requestIdMatch = checkEndpoint.match(/requestId=([^&]+)/);
  const orderId = requestIdMatch?.[1] ?? quote.protocol?.v2?.orderId ?? signature;

  return {
    orderId,
    status:    'pending',
    srcTxHash: signature,
    createdAt: Date.now(),
  };
}

export async function getOrderStatus(orderId: string): Promise<BridgeOrder> {
  const res = await fetch(`${RELAY_API}/intents/status?requestId=${encodeURIComponent(orderId)}`);
  if (!res.ok) throw new Error(`Relay.link status failed (${res.status})`);

  const data = await res.json() as {
    status:      string;
    inTxHash?:   string;
    outTxHash?:  string;
  };

  const statusMap: Record<string, BridgeOrder['status']> = {
    waiting:    'pending',
    pending:    'pending',
    processing: 'pending',
    success:    'fulfilled',
    failure:    'failed',
    refund:     'failed',
  };

  return {
    orderId,
    status:    statusMap[data.status?.toLowerCase()] ?? 'pending',
    srcTxHash: data.inTxHash,
    dstTxHash: data.outTxHash,
    createdAt: Date.now(),
  };
}
