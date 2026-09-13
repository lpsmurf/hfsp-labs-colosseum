// Tagged-transfer checkout for wallets that cannot sign x402 payments.
//
// MiniPay (and some other mobile wallets) do not implement eth_signTypedData, so
// they cannot produce an EIP-3009 authorization. They can send an ordinary
// stablecoin transfer — so this rail prices an order, hands the browser a ready
// transfer whose calldata carries our ERC-8021 attribution tag plus a per-order
// code, and fulfils once that exact transfer is confirmed on-chain.
//
//   POST /api/celo/checkout/quote    { email, items[1], asset? }  → transfer to send
//   POST /api/celo/checkout/confirm  { orderId, txHash }          → verify + fulfil
//   GET  /api/celo/checkout/:orderId                              → status
//
// The buyer signs and pays gas for their own tagged transaction, so the payment
// is attributed to the project and the buyer counts as a signer.
import { Router } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import { ethers } from "ethers";
import { fromDataSuffix, toDataSuffix } from "@celo/attribution-tags";
import { celoEnv } from "../celoConfig.js";
import { TOKENS, operatorAddress, wallets, type CeloAsset } from "../services/evm.js";
import { claimTxSig, redis } from "../services/redis.js";
import { priceOrder, AssetUnavailable, type CeloOrderBody } from "../services/celoFulfil.js";
import { startFulfilment, getProgress } from "../services/celoJobs.js";
import { OrderRejected, rejectionMessage } from "../services/cryptorefills.js";
import type { PriceLock } from "../services/celoState.js";
import { OrderBodySchema, AssetSchema } from "./celoOrders.js";

const router = Router();

// Fee-currency adapters (18-decimal wrappers registered in Celo's
// FeeCurrencyDirectory), verified on-chain 2026-09-13. Passed as `feeCurrency`
// so a MiniPay user holding only stablecoins can pay gas. Never use these as
// the transfer token — they are gas-accounting wrappers, not the stablecoin.
const FEE_CURRENCY: Record<CeloAsset, string> = {
  USDT: "0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72",
  USDC: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
  USAT: "0x0357EE22278c922e1D36cFe6b899269b161880C4",
};

// A human needs longer than an agent between quote and signature.
const QUOTE_SECONDS = 600;
// A transfer mined this long after its quote expired is still honoured; beyond
// it the price may no longer cover fulfilment.
const GRACE_SECONDS = 120;
// Orders stay readable long after the quote for status polling and support.
const ORDER_TTL_SECONDS = 7 * 24 * 3600;

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const ERC20 = new ethers.Interface(["function transfer(address to, uint256 amount)"]);

// Before payment the checkout order tracks itself; after it, the background job does.
type Status = "awaiting_payment" | "paid";

interface CheckoutOrder {
  orderId: string;
  body: CeloOrderBody;
  lock: PriceLock;
  payTo: string;
  token: string;
  expiresAt: number;       // unix seconds
  integrator?: string;
  status: Status;
  txHash?: string;
  payer?: string;
}

const key = (id: string) => `store:celo:checkout:${id}`;
const orderCode = (id: string) => `o${id}`; // ERC-8021 codes: ^[a-z0-9_]{1,32}$

async function load(id: string): Promise<CheckoutOrder | null> {
  const raw = await redis.get(key(id));
  return raw ? JSON.parse(raw) : null;
}
const save = (o: CheckoutOrder) => redis.set(key(o.orderId), JSON.stringify(o), "EX", ORDER_TTL_SECONDS);

async function publicView(o: CheckoutOrder) {
  const progress = o.status === "paid" ? await getProgress(o.orderId) : null;
  const status = progress?.stage ?? o.status;
  return {
    ok: status !== "failed", orderId: o.orderId, status, asset: o.lock.asset,
    amount: o.lock.priceAtomic, amountDisplay: (Number(o.lock.priceAtomic) / 1e6).toFixed(6),
    expiresAt: new Date(o.expiresAt * 1000).toISOString(),
    txHash: o.txHash, result: progress?.result, error: progress?.error,
  };
}

router.post("/quote", async (req, res, next) => {
  try {
    const parsed = OrderBodySchema.safeParse(req.body);
    const asset = AssetSchema.safeParse(req.body?.asset ?? "USDT");
    if (!parsed.success || !asset.success) {
      res.status(400).json({ ok: false, error: "Invalid order", details: parsed.success ? asset.error?.flatten() : parsed.error.flatten() });
      return;
    }
    let lock: PriceLock;
    try {
      lock = await priceOrder(parsed.data, asset.data);
    } catch (error) {
      if (error instanceof AssetUnavailable) {
        res.status(422).json({ ok: false, code: "ASSET_UNAVAILABLE", error: `Paying in ${asset.data} is not available for this order right now. Try USDT.` });
        return;
      }
      if (error instanceof OrderRejected) {
        res.status(422).json({ ok: false, code: error.reason, error: rejectionMessage(error) });
        return;
      }
      throw error;
    }

    const orderId = randomBytes(5).toString("hex");
    const order: CheckoutOrder = {
      orderId, body: parsed.data, lock,
      payTo: operatorAddress(), token: TOKENS.celo[lock.asset],
      expiresAt: Math.floor(Date.now() / 1000) + QUOTE_SECONDS,
      integrator: req.get("x-integrator")?.slice(0, 80),
      status: "awaiting_payment",
    };
    await save(order);

    // The buyer's transaction carries our assigned tag (credited by the
    // leaderboard) and the order code (binds this transfer to this order).
    const data = ERC20.encodeFunctionData("transfer", [order.payTo, BigInt(lock.priceAtomic)])
      + toDataSuffix([celoEnv.ATTRIBUTION_TAG, orderCode(orderId)]).slice(2);

    res.json({
      ...(await publicView(order)),
      transaction: { chainId: 42220, to: order.token, data, value: "0x0" },
      // For wallets that support Celo fee abstraction (MiniPay): pay gas in the same stablecoin.
      feeCurrency: FEE_CURRENCY[lock.asset],
    });
  } catch (error) { next(error); }
});

const ConfirmSchema = z.object({
  orderId: z.string().regex(/^[0-9a-f]{10}$/),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

router.post("/confirm", async (req, res, next) => {
  try {
    const parsed = ConfirmSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ ok: false, error: "orderId and txHash required" }); return; }
    const { orderId, txHash } = parsed.data;

    const order = await load(orderId);
    if (!order) { res.status(404).json({ ok: false, error: "Order not found" }); return; }
    if (order.status !== "awaiting_payment") { res.json(await publicView(order)); return; }

    const provider = wallets().celo.provider!;
    const receipt = await provider.waitForTransaction(txHash, 1, 15_000).catch(() => null);
    const tx = await provider.getTransaction(txHash);
    const fail = (status: number, error: string) => res.status(status).json({ ok: false, orderId, error });
    if (!receipt || !tx) return void fail(409, "Transaction not confirmed yet — try again in a moment.");
    if (receipt.status !== 1) return void fail(402, "Transaction failed on-chain.");

    // Bind the transfer to this order: right token, our tag + this order's code.
    if (tx.to?.toLowerCase() !== order.token.toLowerCase()) return void fail(402, "Transaction is not a transfer of the quoted token.");
    const codes = fromDataSuffix(tx.data as `0x${string}`)?.codes ?? [];
    if (!codes.includes(orderCode(orderId)) || !codes.includes(celoEnv.ATTRIBUTION_TAG)) {
      return void fail(402, "Transaction does not carry this order's reference.");
    }

    // Trust the token's Transfer event, not the calldata: it is what actually moved.
    const paid = receipt.logs.find(l =>
      l.address.toLowerCase() === order.token.toLowerCase()
      && l.topics[0] === TRANSFER_TOPIC
      && ethers.getAddress(ethers.dataSlice(l.topics[1], 12)) === ethers.getAddress(tx.from)
      && ethers.getAddress(ethers.dataSlice(l.topics[2], 12)) === ethers.getAddress(order.payTo)
      && BigInt(l.data) >= BigInt(order.lock.priceAtomic));
    if (!paid) return void fail(402, "No transfer of the quoted amount to the store was found in this transaction.");

    const block = await provider.getBlock(receipt.blockNumber);
    if (!block || block.timestamp > order.expiresAt + GRACE_SECONDS) {
      return void fail(402, "Payment arrived after the quote expired. Contact info@hfsp.xyz for a refund.");
    }

    // One transaction pays for exactly one order, once.
    if (!await claimTxSig(txHash)) return void fail(409, "This transaction was already used for an order.");

    order.status = "paid"; order.txHash = txHash; order.payer = tx.from;
    await save(order);
    // Answer now; the swap/bridge, purchase and delivery run in the background.
    await startFulfilment(orderId, order.body, order.lock, {
      rail: "checkout", tx: txHash, payer: tx.from, integrator: order.integrator,
    });
    res.status(202).json(await publicView(order));
  } catch (error) { next(error); }
});

router.get("/:orderId", async (req, res, next) => {
  try {
    const order = /^[0-9a-f]{10}$/.test(req.params.orderId) ? await load(req.params.orderId) : null;
    if (!order) { res.status(404).json({ ok: false, error: "Order not found" }); return; }
    res.json(await publicView(order));
  } catch (error) { next(error); }
});

export default router;
