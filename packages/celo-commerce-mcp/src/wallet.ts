// Optional local payer. When CELO_BUYER_PRIVATE_KEY is set (stdio use on the
// agent's own machine), buy_product pays automatically — within a hard per-order
// cap, so a confused model cannot spend more than the operator allowed.
import { privateKeyToAccount } from "viem/accounts";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { Asset, PaymentRequired } from "./store.js";

const CELO = "eip155:42220";
const TOKEN: Record<Asset, string> = {
  USDT: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  USDC: "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C",
  USAT: "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771",
};

/** Per-order ceiling in dollars. Defaults low on purpose. */
export const MAX_ORDER_USD = Number(process.env.MAX_ORDER_USD ?? "10");

let http: x402HTTPClient | undefined;

export function localWalletAddress(): string | undefined {
  const key = process.env.CELO_BUYER_PRIVATE_KEY;
  return key ? privateKeyToAccount(key as `0x${string}`).address : undefined;
}

function client(): x402HTTPClient {
  if (!http) {
    const account = privateKeyToAccount(process.env.CELO_BUYER_PRIVATE_KEY as `0x${string}`);
    const c = new x402Client().register(CELO, new ExactEvmScheme(account, { rpcUrl: process.env.CELO_RPC_URL ?? "https://forno.celo.org" }));
    // Stock clients refuse non-default assets; opt Celo USDT/USDC in with the same cap.
    const cap = String(Math.round(MAX_ORDER_USD * 1e6));
    c.setSpendControls?.({ allowedAssets: Object.values(TOKEN).map(asset => ({ network: CELO, asset, maxAmount: cap })) } as never);
    http = new x402HTTPClient(c);
  }
  return http;
}

/** Sign a payment for the Celo option of `paymentRequired` in `asset`, enforcing the cap. */
export async function signPayment(paymentRequired: PaymentRequired, asset: Asset, maxUsd: number): Promise<string> {
  const option = paymentRequired.accepts.find(a => a.network === CELO && a.asset.toLowerCase() === TOKEN[asset].toLowerCase());
  if (!option) throw new Error(`The store did not offer ${asset} on Celo for this order.`);
  const limit = Math.min(maxUsd, MAX_ORDER_USD);
  const usd = Number(option.amount) / 1e6;
  if (usd > limit) throw new Error(`Price $${usd.toFixed(2)} is above the spending limit of $${limit.toFixed(2)}. Nothing was paid.`);

  const payload = await client().createPaymentPayload({ ...paymentRequired, accepts: [option] } as never);
  const header = client().encodePaymentSignatureHeader(payload);
  return header["PAYMENT-SIGNATURE"] ?? Object.values(header)[0];
}
