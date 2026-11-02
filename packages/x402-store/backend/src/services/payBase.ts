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
import { normalizeCrRequirements, encodeCrPaymentSignature } from "./crWire.js";

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
  const normalized = normalizeCrRequirements(crPR);
  const payload = await client().createPaymentPayload(normalized as any);
  const value = encodeCrPaymentSignature(payload as { payload: unknown }, BASE);
  return crPhase2({ ...orderBody, network: "base" }, sessionId, value);
}
