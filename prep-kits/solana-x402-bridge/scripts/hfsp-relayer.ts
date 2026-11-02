import { EVM_TARGETS } from "./evm-targets.js";
import type { BridgeQuote, BridgeResult, EvmChain, ExecutionTerms } from "./types.js";

interface HfspRelayerQuoteResponse {
  route?: string;
  amountIn?: string | number;
  amountOut?: string | number;
  bridgeFeeUSDC?: string | number;
  bridgeFeeBps?: string | number;
  networkFeesUSDC?: string | number;
  priceImpactBps?: string | number;
  minAmountOut?: string | number;
  slippageBps?: string | number;
  etaSeconds?: string | number;
  feeRecipient?: string;
  relayer?: string;
}

interface HfspRelayerExecuteResponse {
  sourceTx?: string;
  destTx?: string;
  destinationTx?: string;
  statusId?: string;
  sourceExplorer?: string;
  destExplorer?: string;
  destinationExplorer?: string;
  status?: string;
}

interface HfspRelayerStatusResponse {
  status?: string;
}

const RELAYER_TIMEOUT_MS = Number(process.env.HFSP_RELAYER_TIMEOUT_MS ?? 15_000);

function relayerFetch(url: string | URL, init: RequestInit = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(RELAYER_TIMEOUT_MS) });
}

function relayerBaseUrl() {
  return process.env.X402_RELAYER_URL ?? "https://bridge.clawdrop.live";
}

/** Resolve a relayer-supplied path, refusing anything off the configured relayer origin. */
function relayerUrl(path: string) {
  const base = new URL(relayerBaseUrl());
  const url = new URL(path, base);
  if (url.origin !== base.origin) throw new Error(`HFSP relayer poll URL ${url.origin} is not on ${base.origin}`);
  return url.toString();
}

function integratorFeeAccount() {
  return process.env.INTEGRATOR_FEE_ACCOUNT || "HFSP_DEFAULT";
}

function normalizeNumber(value: string | number | undefined, fallback = 0) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function transferKind(srcToken: string, destToken: string) {
  return srcToken.toLowerCase() === destToken.toLowerCase() ? "bridge" : "swap";
}

function buildFallbackQuote(srcToken: string, amountIn: number, destChain: EvmChain, destToken: string): BridgeQuote {
  const feeBps = Number(process.env.INTEGRATOR_FEE_BPS ?? 15);
  const feeAmount = srcToken.toLowerCase() === "usdc" ? amountIn * (feeBps / 10_000) : 0;
  const amountOut = Math.max(amountIn - feeAmount, 0);
  const slippageBps = Number(process.env.DEFAULT_SLIPPAGE_BPS ?? 50);
  const etaSeconds = EVM_TARGETS[destChain]?.finalitySeconds ?? 90;

  return {
    kind: transferKind(srcToken, destToken),
    route: `HFSP relayer (${srcToken} Solana -> ${destToken} ${destChain})`,
    srcChain: "solana",
    srcToken,
    destChain,
    destToken,
    amountIn,
    amountOut,
    bridgeFeeUSDC: Number(feeAmount.toFixed(6)),
    bridgeFeeBps: feeBps,
    networkFeesUSDC: 0,
    priceImpactBps: srcToken.toLowerCase() === destToken.toLowerCase() ? 0 : slippageBps,
    minAmountOut: Number((amountOut * (1 - slippageBps / 10_000)).toFixed(6)),
    slippageBps,
    etaSeconds,
    feeRecipient: integratorFeeAccount(),
    relayer: relayerBaseUrl(),
  };
}

export async function quoteViaHfspRelayer(
  srcToken: string,
  amountIn: number,
  destChain: EvmChain,
  destToken: string,
): Promise<BridgeQuote> {
  // A locally computed quote is only meaningful for same-asset transfers; for
  // cross-asset routes (e.g. SOL -> ETH) there is no quote without the relayer.
  const sameAsset = transferKind(srcToken, destToken) === "bridge";
  const recipient = process.env.HFSP_RECIPIENT_ADDRESS;
  if (!recipient) {
    if (sameAsset) return buildFallbackQuote(srcToken, amountIn, destChain, destToken);
    throw new Error("HFSP_RECIPIENT_ADDRESS is required for cross-asset relayer quotes");
  }
  const url = new URL("/api/bridge/quote", relayerBaseUrl());
  url.searchParams.set("amount", String(amountIn));
  url.searchParams.set("recipient", recipient);
  url.searchParams.set("destChain", destChain);
  url.searchParams.set("destToken", destToken);
  url.searchParams.set("sourceChain", "solana");

  try {
    const res = await relayerFetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`relayer quote ${res.status}`);
    const json = await res.json() as { quote?: HfspRelayerQuoteResponse };
    const data = json.quote ?? {};
    const fallback = buildFallbackQuote(srcToken, amountIn, destChain, destToken);
    // Cross-asset output depends on a real conversion rate: take it from the
    // relayer or not at all, never from the same-asset fallback.
    const requiredNumber = (field: "amountOut" | "minAmountOut") => {
      const value = normalizeNumber(data[field], Number.NaN);
      if (!Number.isFinite(value) || value < 0) throw new Error(`relayer quote missing valid ${field}`);
      return value;
    };
    const conversion = sameAsset ? null : { amountOut: requiredNumber("amountOut"), minAmountOut: requiredNumber("minAmountOut") };
    return {
      ...fallback,
      route: data.route ?? fallback.route,
      amountIn: normalizeNumber(data.amountIn, fallback.amountIn),
      amountOut: conversion?.amountOut ?? normalizeNumber(data.amountOut, fallback.amountOut),
      bridgeFeeUSDC: normalizeNumber(data.bridgeFeeUSDC, fallback.bridgeFeeUSDC),
      bridgeFeeBps: normalizeNumber(data.bridgeFeeBps, fallback.bridgeFeeBps),
      networkFeesUSDC: normalizeNumber(data.networkFeesUSDC, fallback.networkFeesUSDC),
      priceImpactBps: normalizeNumber(data.priceImpactBps, fallback.priceImpactBps),
      minAmountOut: conversion?.minAmountOut ?? normalizeNumber(data.minAmountOut, fallback.minAmountOut),
      slippageBps: normalizeNumber(data.slippageBps, fallback.slippageBps),
      etaSeconds: normalizeNumber(data.etaSeconds, fallback.etaSeconds),
      feeRecipient: data.feeRecipient ?? fallback.feeRecipient,
      relayer: data.relayer ?? fallback.relayer,
    };
  } catch (error) {
    if (sameAsset) return buildFallbackQuote(srcToken, amountIn, destChain, destToken);
    throw error;
  }
}

export async function executeViaHfspRelayer(
  srcToken: string,
  amountIn: number,
  destChain: EvmChain,
  destToken: string,
  terms?: ExecutionTerms,
): Promise<BridgeResult> {
  const paymentSig = process.env.X402_PAYMENT_SIGNATURE;
  const recipient = process.env.HFSP_RECIPIENT_ADDRESS;
  if (!paymentSig) throw new Error("X402_PAYMENT_SIGNATURE is required for HFSP relayer execution");
  if (!recipient) throw new Error("HFSP_RECIPIENT_ADDRESS is required for HFSP relayer execution");
  const res = await relayerFetch(new URL("/api/bridge", relayerBaseUrl()), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-payment": paymentSig,
      "x-payment-chain": process.env.X402_PAYMENT_CHAIN ?? "solana",
    },
    body: JSON.stringify({
      amount: amountIn,
      recipient,
      destChain,
      destToken,
      sourceChain: "solana",
      // The relayer refuses to submit if the live quote falls below this floor.
      ...(terms ? { minAmountOut: terms.minAmountOut } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HFSP relayer execute failed (${res.status}): ${body}`);
  }

  const data = await res.json() as HfspRelayerExecuteResponse & { poll?: string };
  if (!data.statusId && !data.sourceTx && !data.poll) {
    throw new Error("HFSP relayer returned no settlement handle (statusId, sourceTx, or poll)");
  }
  const final = data.status === "fulfilled" || data.status === "failed";
  if (data.status === "failed") throw new Error("HFSP relayer reported failed settlement");
  const pollUrl = data.poll
    ? relayerUrl(data.poll)
    : data.statusId && !final ? relayerUrl(`/api/bridge/${encodeURIComponent(data.statusId)}`) : null;
  if (pollUrl) {
    const status = await pollUntilSettled(pollUrl);
    return {
      sourceTx: status.sourceTx ?? data.sourceTx ?? "",
      destTx: status.destTx ?? status.destinationTx ?? data.destTx ?? data.destinationTx ?? "",
      statusId: data.statusId ?? "",
      sourceExplorer: status.sourceExplorer ?? data.sourceExplorer ?? "",
      destExplorer: status.destExplorer ?? status.destinationExplorer ?? data.destExplorer ?? data.destinationExplorer ?? "",
    };
  }
  return {
    sourceTx: data.sourceTx ?? "",
    destTx: data.destTx ?? data.destinationTx ?? "",
    statusId: data.statusId ?? "",
    sourceExplorer: data.sourceExplorer ?? "",
    destExplorer: data.destExplorer ?? data.destinationExplorer ?? "",
  };
}

export async function getHfspRelayerStatus(statusId: string): Promise<string> {
  const res = await relayerFetch(new URL(`/api/bridge/${encodeURIComponent(statusId)}`, relayerBaseUrl()), {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HFSP relayer status failed (${res.status})`);
  const data = await res.json() as HfspRelayerStatusResponse;
  return data.status ?? "pending";
}

async function pollUntilSettled(url: string) {
  const attempts = Number(process.env.HFSP_STATUS_ATTEMPTS ?? 20);
  const delayMs = Number(process.env.HFSP_STATUS_DELAY_MS ?? 3000);
  for (let i = 0; i < attempts; i += 1) {
    const res = await relayerFetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HFSP relayer status failed (${res.status})`);
    const data = await res.json() as HfspRelayerExecuteResponse;
    if (data.status === "fulfilled") return data;
    if (data.status === "failed") throw new Error("HFSP relayer reported failed settlement");
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("HFSP relayer status polling timed out");
}
