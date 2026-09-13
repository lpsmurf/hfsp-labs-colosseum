// Pays Cryptorefills on Base with the stock x402 client, using the operator key.
//
// Unlike the Solana path there is no transaction to build: Base USDC settles an
// EIP-3009 authorization, so we sign it and Cryptorefills' facilitator submits it.
// The operator needs Base USDC but no ETH.
import { privateKeyToAccount } from "viem/accounts";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { celoEnv } from "../celoConfig.js";
import { crPhase2, type CrOrderBody, type CrPaymentRequired } from "./cryptorefills.js";

const BASE = "eip155:8453";
let http: x402HTTPClient | undefined;

function client(): x402HTTPClient {
  if (!http) {
    const account = privateKeyToAccount(celoEnv.STORE_EVM_PRIVATE_KEY as `0x${string}`);
    // Refuse anything but Base: a Cryptorefills response naming another network
    // must fail here rather than be signed.
    const selector = (_v: number, reqs: { network: string }[]) => {
      const pick = reqs.find(r => r.network === BASE);
      if (!pick) throw new Error(`Cryptorefills offered no Base option (got ${reqs.map(r => r.network).join(", ")})`);
      return pick as any;
    };
    http = new x402HTTPClient(new x402Client(selector).register(BASE, new ExactEvmScheme(account)));
  }
  return http;
}

export async function payAndFulfillBase(
  orderBody: CrOrderBody,
  sessionId: string,
  crPR: CrPaymentRequired,
  maxAtomic: bigint,
): Promise<unknown> {
  const accept = crPR.accepts.find(a => a.network === BASE);
  const amount = BigInt(accept?.amount ?? accept?.maxAmountRequired ?? "0");
  // Never sign for more than the buyer paid us to spend on this order.
  if (amount === 0n || amount > maxAtomic) {
    throw new Error(`Cryptorefills now asks ${amount} atomic USDC, above the ${maxAtomic} budgeted for this order`);
  }
  // Cryptorefills labels its 402 x402Version 2 but sends V1-shaped accepts
  // (seen 2026-09-13): `maxAmountRequired` instead of `amount`, and no
  // `maxTimeoutSeconds`. SDK 2.25 reads both (spend controls, the EIP-3009
  // validBefore), so fill them in: the amount as given, the timeout from the
  // challenge's top-level expiresAt, capped at five minutes.
  const expiresAt = (crPR as { expiresAt?: string | number }).expiresAt;
  const expiresMs = typeof expiresAt === "number" ? (expiresAt < 1e12 ? expiresAt * 1000 : expiresAt) : Date.parse(expiresAt ?? "");
  const secondsLeft = Number.isFinite(expiresMs) ? Math.floor((expiresMs - Date.now()) / 1000) : 300;
  const normalized = {
    ...crPR,
    accepts: crPR.accepts.map(a => ({
      ...a,
      amount: a.amount ?? a.maxAmountRequired,
      maxTimeoutSeconds: (a as { maxTimeoutSeconds?: number }).maxTimeoutSeconds ?? Math.max(30, Math.min(300, secondsLeft)),
    })),
  };
  const payload = await client().createPaymentPayload(normalized as any);
  // Cryptorefills decodes the same wrapper as its Solana flow — base64url of
  // {x402Version, scheme, network, payload} — and rejects the SDK's standard
  // base64 V2 envelope ("Failed to decode PAYMENT-SIGNATURE header", 2026-09-13).
  // The EIP-3009 signature inside is still produced by the SDK.
  const wrapper = {
    x402Version: 2,
    scheme: "exact",
    network: BASE,
    payload: (payload as { payload: unknown }).payload,
  };
  const value = Buffer.from(JSON.stringify(wrapper)).toString("base64url");
  return crPhase2({ ...orderBody, network: "base" }, sessionId, value);
}
