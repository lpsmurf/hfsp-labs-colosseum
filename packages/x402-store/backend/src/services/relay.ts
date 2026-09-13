// Relay routes: Celo stablecoin → Base USDC, for orders fulfilled without a float.
//
// A quote is a list of steps, each a list of transactions to send from our
// wallet (typically approve, then deposit/swap), plus a status endpoint that
// reports when the request has filled.
//
// USDT and USDC bridge directly. USAT has no bridge route (checked 2026-09-13),
// so it goes in two legs: swap USAT → USDT on Celo, then bridge the USDT.
import { celoEnv } from "../celoConfig.js";
import { BASE_CHAIN_ID, CELO_CHAIN_ID, TOKENS, tagged, wallets, type CeloAsset } from "./evm.js";

interface RelayTxData { to: string; data: string; value: string; chainId: number }
interface RelayStep { id: string; kind: string; requestId?: string; items: { data: RelayTxData }[] }
interface RelayLeg {
  steps: RelayStep[];
  amountIn: bigint;
  amountOut: bigint;
}
export interface RelayQuote {
  asset: CeloAsset;
  legs: RelayLeg[];
  amountIn: bigint;  // atomic units of the Celo asset the whole route consumes (6 decimals)
  amountOut: bigint; // atomic Base USDC
}

// Extra USDT bought by the USAT swap so the bridge leg, re-quoted after the swap
// lands, still fits. Leftover dust stays in the operator wallet.
const SWAP_MARGIN_BPS = 50n;

async function quoteLeg(destinationChainId: number, originCurrency: string, destinationCurrency: string, amountOut: bigint): Promise<RelayLeg> {
  const address = wallets().celo.address;
  const res = await fetch(`${celoEnv.RELAY_API}/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user: address, recipient: address,
      originChainId: CELO_CHAIN_ID, destinationChainId,
      originCurrency, destinationCurrency,
      amount: amountOut.toString(), tradeType: "EXACT_OUTPUT",
    }),
  });
  const body = await res.json() as any;
  if (!res.ok || !body.steps) throw new Error(`Relay quote failed ${res.status}: ${body.message ?? JSON.stringify(body).slice(0, 200)}`);
  return {
    steps: body.steps,
    amountIn: BigInt(body.details.currencyIn.amount),
    amountOut: BigInt(body.details.currencyOut.amount),
  };
}

const bridgeLeg = (from: "USDT" | "USDC", usdcOut: bigint) =>
  quoteLeg(BASE_CHAIN_ID, TOKENS.celo[from], TOKENS.base.USDC, usdcOut);

const swapToUsdt = (usdtOut: bigint) =>
  quoteLeg(CELO_CHAIN_ID, TOKENS.celo.USAT, TOKENS.celo.USDT, usdtOut);

const withMargin = (atomic: bigint) => (atomic * (10_000n + SWAP_MARGIN_BPS) + 9_999n) / 10_000n;

/** Quote the Celo-side amount of `asset` needed to land exactly `usdcOut` on Base. */
export async function quoteExactOutput(asset: CeloAsset, usdcOut: bigint): Promise<RelayQuote> {
  if (asset !== "USAT") {
    const leg = await bridgeLeg(asset, usdcOut);
    return { asset, legs: [leg], amountIn: leg.amountIn, amountOut: leg.amountOut };
  }
  const bridge = await bridgeLeg("USDT", usdcOut);
  const swap = await swapToUsdt(withMargin(bridge.amountIn));
  return { asset, legs: [swap, bridge], amountIn: swap.amountIn, amountOut: bridge.amountOut };
}

async function executeLeg(leg: RelayLeg, timeoutMs: number): Promise<{ requestId: string; txHashes: string[] }> {
  const { celo } = wallets();
  const txHashes: string[] = [];
  let requestId = "";
  for (const step of leg.steps) {
    if (step.kind !== "transaction") throw new Error(`Relay step ${step.id} is ${step.kind}; only transaction steps are supported`);
    requestId ||= step.requestId ?? "";
    for (const { data } of step.items) {
      if (data.chainId !== CELO_CHAIN_ID) throw new Error(`Relay asked to send on chain ${data.chainId}, expected Celo`);
      const tx = await celo.sendTransaction({ to: data.to, data: tagged(data.data), value: BigInt(data.value ?? "0") });
      txHashes.push(tx.hash);
      const receipt = await tx.wait();
      if (receipt?.status !== 1) throw new Error(`Relay ${step.id} transaction reverted: ${tx.hash}`);
    }
  }
  if (!requestId) throw new Error("Relay quote carried no requestId to track");

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${celoEnv.RELAY_API}/intents/status?requestId=${requestId}`);
    const status = res.ok ? (await res.json() as any).status : undefined;
    if (status === "success") return { requestId, txHashes };
    if (status === "failure" || status === "refund") throw new Error(`Relay request ${requestId} ended as ${status}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Relay request ${requestId} not filled within ${timeoutMs / 1000}s`);
}

/**
 * Send every leg's transactions (tagged) and wait for each fill.
 *
 * For USAT the bridge leg is re-quoted once the swap has landed, since the
 * original bridge quote may have gone stale while the swap confirmed. If the
 * fresh bridge needs more USDT than the swap produced, this throws with the
 * USDT still in the operator wallet, for reconciliation.
 */
export async function executeBridge(quote: RelayQuote, timeoutMs = 120_000): Promise<{ requestId: string; txHashes: string[] }> {
  if (quote.legs.length === 1) return executeLeg(quote.legs[0], timeoutMs);

  const [swap, staleBridge] = quote.legs;
  const swapped = await executeLeg(swap, timeoutMs);
  const bridge = await bridgeLeg("USDT", staleBridge.amountOut);
  if (bridge.amountIn > swap.amountOut) {
    throw new Error(`bridge now needs ${bridge.amountIn} USDT, swap produced ${swap.amountOut} (swap ${swapped.requestId} done)`);
  }
  const bridged = await executeLeg(bridge, timeoutMs);
  return { requestId: bridged.requestId, txHashes: [...swapped.txHashes, ...bridged.txHashes] };
}
