// First real paid order through the Celo x402 rail, with a stock x402 client.
//
//   STORE_URL=https://store.hfsp.cloud BUYER_PRIVATE_KEY=0x… \
//     npx tsx scripts/celo-first-order.ts --phone +2348031234567 --email you@example.com [--asset USDT|USDC|USAT] [--send]
//
// Without --send it only fetches the 402 and prints the price. With --send it
// signs the payment (capped by --max-usd, default 2) and prints the store's
// answer plus the decoded PAYMENT-RESPONSE. The buyer wallet needs the chosen stablecoin on Celo;
// gas is paid by the facilitator.
import { privateKeyToAccount } from "viem/accounts";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const CELO = "eip155:42220";
const TOKENS = {
  USDT: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  USDC: "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C",
  USAT: "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771",
} as const;
const assetName = (arg("asset", "USDT")!.toUpperCase()) as keyof typeof TOKENS;
const TOKEN = TOKENS[assetName];
if (!TOKEN) throw new Error("--asset must be USDT, USDC or USAT");
const store = (process.env.STORE_URL ?? "http://localhost:3002").replace(/\/$/, "");
const send = process.argv.includes("--send");
const maxUsd = Number(arg("max-usd", "2"));
const phone = arg("phone");
const email = arg("email");
if (!email) throw new Error("--email is required (gift card codes are delivered there); add --phone +<country code><number> for top-ups");

// ₦1,540 MTN Nigeria airtime by default — the order the price checks used.
const countryCode = arg("country", "ng")!;
const brandName = arg("brand", "MTN Credits");
const productValue = Number(arg("value", "1540"));

const catalog = await (await fetch(`${store}/api/catalog?country_code=${countryCode}&brand_name=${encodeURIComponent(brandName!)}`)).json() as any[];
const product = arg("product") ? catalog.find(p => p.product_id === arg("product")) : catalog.find(p => p.is_range);
if (!product) throw new Error(`No product found for ${brandName} in ${countryCode}`);

const body = {
  email,
  items: [{ product_id: product.product_id, ...(phone ? { beneficiary_account: phone } : {}), ...(product.is_range ? { product_value: productValue } : {}) }],
};
const url = `${store}/api/celo/orders?asset=${assetName}`;
const post = (headers: Record<string, string> = {}) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const key = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
if (send && !key) throw new Error("--send needs BUYER_PRIVATE_KEY");
const account = key ? privateKeyToAccount(key) : undefined;
const client = new x402Client();
if (account) {
  client.register(CELO, new ExactEvmScheme(account, { rpcUrl: process.env.CELO_RPC_URL ?? "https://forno.celo.org" }));
  client.setSpendControls?.({ allowedAssets: [{ network: CELO, asset: TOKEN, maxAmount: String(Math.round(maxUsd * 1e6)) }] } as never);
}
const http = new x402HTTPClient(client);

console.log(`store    ${store}`);
console.log(`product  ${product.product_id} ${product.brand_name ?? brandName} ${product.is_range ? `${productValue} ${product.currency}` : product.denomination_label}`);
console.log(`buyer    ${account?.address ?? "(none — quote only)"}`);

const first = await post();
if (first.status !== 402) throw new Error(`Expected 402, got ${first.status}: ${await first.text()}`);
const paymentRequired = http.getPaymentRequiredResponse(name => first.headers.get(name), await first.json().catch(() => undefined));
const option = paymentRequired.accepts.find(a => a.network === CELO && a.asset.toLowerCase() === TOKEN.toLowerCase());
if (!option) throw new Error(`Store did not offer Celo ${assetName}`);
const usd = Number(option.amount) / 1e6;
console.log(`price    ${usd.toFixed(6)} ${assetName} → ${option.payTo}  (flow: ${String(option.extra?.paymentFlow ?? "authorization")})`);

if (!send) { console.log("\nQuote only. Re-run with --send to pay."); process.exit(0); }
if (usd > maxUsd) throw new Error(`Price $${usd.toFixed(2)} is above --max-usd ${maxUsd}; nothing paid`);

const payload = await http.createPaymentPayload({ ...paymentRequired, accepts: [option] });
const paid = await post(http.encodePaymentSignatureHeader(payload));
const receipt = paid.headers.get("PAYMENT-RESPONSE");
console.log(`\nstatus   ${paid.status}`);
if (receipt) console.log("receipt ", JSON.stringify(http.getPaymentSettleResponse(name => paid.headers.get(name)), null, 2));
console.log(JSON.stringify(await paid.json().catch(() => ({})), null, 2));
