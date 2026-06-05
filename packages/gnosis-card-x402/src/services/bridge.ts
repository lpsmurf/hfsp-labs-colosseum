/**
 * deBridge DLN — Solana USDC → Gnosis Chain token bridge.
 *
 * Flow:
 *   1. getQuote()  — get fee-inclusive amount needed on Solana
 *   2. createOrder() — get unsigned Solana tx from deBridge
 *   3. signAndSubmit() — sign with our wallet, submit to Solana
 *   4. getOrderStatus() — poll until fulfilled
 *
 * Our server holds the Solana wallet that received the x402 payment.
 * We bridge from that wallet to the user's Gnosis Safe address directly.
 * No intermediary — user receives tokens straight into their Safe.
 */

import { Connection, VersionedTransaction, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { config, CHAIN_IDS, GNOSIS_TOKENS, USDC_MINT, HELIUS_RPC, type GnosisToken } from '../config.js';

const DLN_API = config.DBRIDGE_API_URL;

export interface BridgeQuote {
  srcAmountUsdc: number;          // USDC to send on Solana (inc. our fee)
  dstAmountRaw: string;           // raw token units received on Gnosis Chain
  dstAmountFormatted: number;     // human-readable token amount
  dstToken: GnosisToken;
  dstTokenAddress: string;
  bridgeFeeUsdc: number;          // deBridge protocol fee
  ourFeeUsdc: number;             // our service fee
  estimatedFillTimeMs: number;
}

export interface BridgeOrder {
  orderId: string;
  status: 'pending' | 'fulfilled' | 'failed';
  srcTxHash?: string;
  dstTxHash?: string;
  createdAt: number;
}

function getServerKeypair(): Keypair {
  return Keypair.fromSecretKey(bs58.decode(config.WALLET_PRIVATE_KEY));
}

/**
 * Get a bridge quote: how much USDC the user needs to send on Solana
 * for `dstAmount` of `dstToken` to land in `safeAddress` on Gnosis Chain.
 *
 * If dstAmount is omitted, quotes for srcAmountUsdc (minus fees).
 */
export async function getQuote(opts: {
  srcAmountUsdc: number;
  dstToken: GnosisToken;
  safeAddress: string;
}): Promise<BridgeQuote> {
  const { srcAmountUsdc, dstToken, safeAddress } = opts;
  const feePct = parseFloat(config.TOPUP_FEE_PCT) / 100;
  const ourFeeUsdc = parseFloat((srcAmountUsdc * feePct).toFixed(6));

  // Amount we actually bridge after taking our cut
  const bridgeAmountUsdc = srcAmountUsdc - ourFeeUsdc;
  const srcAmountRaw = Math.round(bridgeAmountUsdc * 1_000_000).toString(); // USDC has 6 decimals

  const params = new URLSearchParams({
    srcChainId:                    CHAIN_IDS.SOLANA.toString(),
    srcChainTokenIn:               USDC_MINT,
    srcChainTokenInAmount:         srcAmountRaw,
    dstChainId:                    CHAIN_IDS.GNOSIS.toString(),
    dstChainTokenOut:              GNOSIS_TOKENS[dstToken],
    dstChainTokenOutRecipient:     safeAddress,
    srcChainOrderAuthorityAddress: config.WALLET_PUBLIC_KEY,
    dstChainOrderAuthorityAddress: safeAddress,
    prependOperatingExpenses:      'false',
  });

  const res = await fetch(`${DLN_API}/dln/order/quote?${params}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`deBridge quote failed (${res.status}): ${body}`);
  }

  const data = await res.json() as {
    estimation: {
      srcChainTokenIn:  { amount: string; decimals: number };
      dstChainTokenOut: { amount: string; decimals: number; recommendedAmount: string };
      costsDetails:     Array<{ payload: { feeAmount: string; tokenIn: { decimals: number } } }>;
    };
    order: { approximateFulfillmentDelay: number };
  };

  const srcEst   = data.estimation.srcChainTokenIn;
  const dstEst   = data.estimation.dstChainTokenOut;
  const bridgeFeeRaw = data.estimation.costsDetails?.[0]?.payload?.feeAmount ?? '0';
  const bridgeFeeDecimals = data.estimation.costsDetails?.[0]?.payload?.tokenIn?.decimals ?? 6;
  const bridgeFeeUsdc = parseFloat(bridgeFeeRaw) / 10 ** bridgeFeeDecimals;

  return {
    srcAmountUsdc,
    dstAmountRaw:       dstEst.recommendedAmount ?? dstEst.amount,
    dstAmountFormatted: parseFloat(dstEst.recommendedAmount ?? dstEst.amount) / 10 ** dstEst.decimals,
    dstToken,
    dstTokenAddress:    GNOSIS_TOKENS[dstToken],
    bridgeFeeUsdc:      parseFloat(bridgeFeeUsdc.toFixed(6)),
    ourFeeUsdc,
    estimatedFillTimeMs: (data.order?.approximateFulfillmentDelay ?? 60) * 1000,
  };
}

/**
 * Build, sign, and submit the bridge order transaction from our Solana wallet.
 * Returns an orderId that can be polled via getOrderStatus().
 */
export async function createAndSubmitOrder(opts: {
  srcAmountUsdc: number;
  dstToken: GnosisToken;
  safeAddress: string;
}): Promise<BridgeOrder> {
  const { srcAmountUsdc, dstToken, safeAddress } = opts;
  const feePct = parseFloat(config.TOPUP_FEE_PCT) / 100;
  const bridgeAmountUsdc = srcAmountUsdc * (1 - feePct);
  const srcAmountRaw = Math.round(bridgeAmountUsdc * 1_000_000).toString();

  const params = new URLSearchParams({
    srcChainId:                    CHAIN_IDS.SOLANA.toString(),
    srcChainTokenIn:               USDC_MINT,
    srcChainTokenInAmount:         srcAmountRaw,
    dstChainId:                    CHAIN_IDS.GNOSIS.toString(),
    dstChainTokenOut:              GNOSIS_TOKENS[dstToken],
    dstChainTokenOutRecipient:     safeAddress,
    srcChainOrderAuthorityAddress: config.WALLET_PUBLIC_KEY,
    dstChainOrderAuthorityAddress: safeAddress,
    prependOperatingExpenses:      'false',
  });

  // Get unsigned transaction from deBridge
  const res = await fetch(`${DLN_API}/dln/order/create-tx?${params}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`deBridge create-tx failed (${res.status}): ${body}`);
  }

  const data = await res.json() as {
    tx:    { data: string };           // base64-encoded unsigned Solana tx
    orderId: { stringValue: string };
  };

  const keypair = getServerKeypair();
  const connection = new Connection(HELIUS_RPC, 'confirmed');

  // Deserialize → sign → submit
  const txBytes = Buffer.from(data.tx.data, 'base64');
  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([keypair]);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  await connection.confirmTransaction(signature, 'confirmed');

  const orderId = data.orderId?.stringValue ?? signature;

  return {
    orderId,
    status:    'pending',
    srcTxHash: signature,
    createdAt: Date.now(),
  };
}

/**
 * Poll deBridge for the status of a submitted order.
 */
export async function getOrderStatus(orderId: string): Promise<BridgeOrder> {
  const res = await fetch(`${DLN_API}/dln/order/${encodeURIComponent(orderId)}`);
  if (!res.ok) {
    throw new Error(`deBridge order status failed (${res.status})`);
  }

  const data = await res.json() as {
    status:           string;
    orderId:          string;
    srcTxHash?:       string;
    fulfilledDstEventMetadata?: { transactionHash?: { stringValue?: string } };
  };

  const statusMap: Record<string, BridgeOrder['status']> = {
    Created:           'pending',
    Processing:        'pending',
    Fulfilled:         'fulfilled',
    SentUnlock:        'fulfilled',
    ClaimedUnlock:     'fulfilled',
    OrderCancelled:    'failed',
    SentOrderCancel:   'failed',
    ClaimedOrderCancel: 'failed',
  };

  return {
    orderId: data.orderId ?? orderId,
    status:  statusMap[data.status] ?? 'pending',
    srcTxHash: data.srcTxHash,
    dstTxHash: data.fulfilledDstEventMetadata?.transactionHash?.stringValue,
    createdAt: Date.now(),
  };
}
