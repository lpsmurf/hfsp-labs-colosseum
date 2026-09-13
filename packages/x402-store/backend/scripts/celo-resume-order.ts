// Finish a paid Celo order that stopped after its USAT → USDT swap.
//
//   npx tsx scripts/celo-resume-order.ts --tx 0x… --product <id> --email a@b.c [--phone +…] [--send]
//
// Operator tool, run on the store host. It re-quotes Cryptorefills and the USDT
// bridge, refuses if the bridge needs more USDT than the wallet holds or than the
// buyer's payment covers, and only then bridges and fulfils. Without --send it
// prints the plan. The x402 payment itself is never touched.
import "dotenv/config";
import { ethers } from "ethers";
import { crPhase1 } from "../src/services/cryptorefills.js";
import { quoteExactOutput, executeBridge } from "../src/services/relay.js";
import { payAndFulfillBase } from "../src/services/payBase.js";
import { TOKENS, wallets, baseUsdcBalance } from "../src/services/evm.js";
import { redis } from "../src/services/redis.js";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const tx = arg("tx"), productId = arg("product"), email = arg("email"), phone = arg("phone");
if (!tx || !productId || !email) throw new Error("--tx, --product and --email are required");
const send = process.argv.includes("--send");

await redis.connect().catch(() => {});
const records = (await redis.lrange("store:celo:recon", 0, -1)).map(r => JSON.parse(r));
const record = records.find(r => r.tx === tx);
if (!record) throw new Error(`No reconciliation record for ${tx}`);
if ((await redis.lrange("store:celo:orders", 0, -1)).some(r => JSON.parse(r).tx === tx)) throw new Error(`${tx} was already fulfilled`);

const body = { email, items: [{ product_id: productId, ...(phone ? { beneficiary_account: phone } : {}) }] };
const cr = await crPhase1({ ...body, network: "base" });
const quote = await quoteExactOutput("USDT", cr.crAmount);
const usdt: bigint = await new ethers.Contract(TOKENS.celo.USDT, ["function balanceOf(address) view returns (uint256)"], wallets().celo)
  .balanceOf(wallets().celo.address);

const onBase = await baseUsdcBalance();
console.log(`base     operator holds ${onBase} USDC`);
console.log(`record   paid ${record.paidAtomic} ${record.asset} from ${record.payer}: ${record.error}`);
console.log(`supplier ${cr.crAmount} Base USDC`);
console.log(`bridge   needs ${quote.amountIn} USDT, wallet holds ${usdt}`);
const needBridge = onBase < cr.crAmount;
if (needBridge && quote.amountIn > usdt) throw new Error("Not enough USDT in the operator wallet to bridge; nothing sent");
if (needBridge && quote.amountIn > BigInt(record.paidAtomic)) throw new Error("Bridge now costs more than the buyer paid; nothing sent");
if (!send) { console.log("\nPlan only. Re-run with --send."); process.exit(0); }

// A previous resume may already have bridged: never bridge twice.
const bridge = needBridge ? await executeBridge(quote) : { requestId: "already-on-base", txHashes: [] as string[] };
console.log(`bridged  ${bridge.requestId} ${bridge.txHashes.join(" ")}`);
const result = await payAndFulfillBase(body as never, cr.sessionId, cr.paymentRequired, cr.crAmount);
await redis.lpush("store:celo:orders", JSON.stringify({
  at: new Date().toISOString(), ...record, error: undefined, resumed: true, crAtomic: cr.crAmount.toString(), bridge: bridge.requestId,
}));
console.log(JSON.stringify(result, null, 2));
process.exit(0);
