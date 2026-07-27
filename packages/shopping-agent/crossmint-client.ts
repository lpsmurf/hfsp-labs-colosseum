/**
 * crossmint-client.ts — order placement + crypto checkout (Arm A "buy" stage).
 *
 * Typed wrapper over Crossmint's Headless Checkout / Worldstore Orders API: buy
 * a physical Amazon item and pay in crypto. Decision locked: Crossmint for
 * checkout; Zinc is a later swap behind the same CheckoutProvider interface if
 * we need lower-level order control.
 *
 * Docs (verified 2026-06-27):
 *   - https://docs.crossmint.com/payments/headless/guides/providers/amazon
 *   - https://docs.crossmint.com/payments/headless/guides/physical-good-purchases
 *   - https://docs.crossmint.com/agents/payment-flows/worldstore/order-management
 *   - prod  base: https://www.crossmint.com/api/2022-06-09
 *   - staging base: https://staging.crossmint.com/api/2022-06-09
 *   - auth: X-API-KEY: <server-side key with orders.create/read/update scopes>
 *
 * Flow: createOrder → returns a quote + payment.preparation.serializedTransaction
 *       → agent signs with its OWN Solana wallet + submits → poll order/tracking.
 *
 * ⚠ CHAIN-SPLIT CAVEAT (flag, do not bury): every Crossmint physical-good /
 *   Worldstore example in the live docs settles in USDC on an EVM chain
 *   (base-sepolia / ethereum-sepolia), NOT Solana. Crossmint supports Solana
 *   USDC on other flows, but Solana settlement for Amazon checkout is UNVERIFIED.
 *   Until confirmed, treat `method: "solana"` here as PLANNED — see PREP-KIT.md
 *   "Open decision: Crossmint checkout chain". Default left as "solana" because
 *   the whole rest of the stack is Solana; flip to a Base payer wallet only if
 *   Crossmint requires it for Amazon.
 */

import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import type { CheckoutProvider, OrderResult, OrderTracking, PurchaseRequest } from "./providers.js";
import { USDC_MAINNET } from "./providers.js";

const PROD_BASE = "https://www.crossmint.com/api/2022-06-09";
const STAGING_BASE = "https://staging.crossmint.com/api/2022-06-09";

export interface CrossmintConfig {
  apiKey: string;
  /** bs58 Solana secret key for the agent wallet (signs the payment tx). */
  walletSecretKey: string;
  /** Solana RPC (Helius recommended) for submitting the signed tx. */
  rpcUrl: string;
  env?: "production" | "staging"; // default staging
  /** Payment chain — "solana" by default; see chain-split caveat above. */
  paymentMethod?: string; // e.g. "solana" | "base"
  paymentCurrency?: string; // "usdc"
}

// Minimal views of the Crossmint order/tracking responses.
interface CrossmintOrder {
  order?: {
    orderId?: string;
    phase?: string;
    quote?: { totalPrice?: { amount?: string; currency?: string } };
    payment?: { preparation?: { serializedTransaction?: string } };
  };
  // some responses return the order fields at top level
  orderId?: string;
  phase?: string;
}

export class CrossmintClient implements CheckoutProvider {
  private readonly base: string;
  private readonly wallet: Keypair;
  private readonly connection: Connection;
  constructor(private readonly config: CrossmintConfig) {
    this.base = (config.env ?? "staging") === "production" ? PROD_BASE : STAGING_BASE;
    this.wallet = Keypair.fromSecretKey(bs58.decode(config.walletSecretKey));
    this.connection = new Connection(config.rpcUrl, "confirmed");
  }

  /** The agent wallet address — used as payerAddress and for receipts. */
  get payerAddress(): string {
    return this.wallet.publicKey.toBase58();
  }

  /** Build the Create Order request body (exposed for the demo's dry-run). */
  buildOrderBody(req: PurchaseRequest): Record<string, unknown> {
    return {
      recipient: {
        email: req.recipientEmail,
        physicalAddress: {
          name: req.shipTo.name,
          line1: req.shipTo.line1,
          ...(req.shipTo.line2 ? { line2: req.shipTo.line2 } : {}),
          city: req.shipTo.city,
          state: req.shipTo.state,
          postalCode: req.shipTo.postalCode,
          country: req.shipTo.country,
        },
      },
      payment: {
        method: this.config.paymentMethod ?? "solana",
        currency: this.config.paymentCurrency ?? "usdc",
        payerAddress: this.payerAddress,
      },
      lineItems: [{ productLocator: req.productLocator }], // e.g. "amazon:B01DFKC2SO"
    };
  }

  /** POST /orders — create the order + get the tx the agent must sign. */
  async createOrder(req: PurchaseRequest): Promise<OrderResult> {
    const res = await fetch(`${this.base}/orders`, {
      method: "POST",
      headers: { "X-API-KEY": this.config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(this.buildOrderBody(req)),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Crossmint POST /orders → ${res.status} ${res.statusText} ${detail}`);
    }
    const data = (await res.json()) as CrossmintOrder;
    const o = data.order ?? data;
    const totalStr = data.order?.quote?.totalPrice?.amount;
    const orderId = o.orderId;
    if (!orderId) throw new Error("Crossmint: order created but no orderId returned");

    const totalUsd = totalStr ? Number(totalStr) : undefined;
    // Fail closed against the buyer's ceiling before we ever sign a payment.
    if (totalUsd !== undefined && totalUsd > req.maxTotalUsd) {
      throw new Error(`Crossmint quote $${totalUsd} exceeds maxTotalUsd $${req.maxTotalUsd} — aborting buy`);
    }

    return {
      orderId,
      phase: o.phase ?? "quote",
      totalUsd,
      serializedTransaction: data.order?.payment?.preparation?.serializedTransaction,
    };
  }

  /** Sign the returned Solana tx with the agent wallet and submit payment. */
  async payOrder(order: OrderResult): Promise<{ txSig: string }> {
    if (!order.serializedTransaction) {
      throw new Error("Crossmint: order has no serializedTransaction to sign (non-Solana payment?)");
    }
    const tx = VersionedTransaction.deserialize(Buffer.from(order.serializedTransaction, "base64"));
    tx.sign([this.wallet]);
    const txSig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(txSig, "confirmed");
    return { txSig };
  }

  /** GET /orders/{id}/tracking — fulfillment + shipping status (Amazon). */
  async getTracking(orderId: string): Promise<OrderTracking> {
    const res = await fetch(`${this.base}/orders/${encodeURIComponent(orderId)}/tracking`, {
      headers: { "X-API-KEY": this.config.apiKey },
    });
    if (!res.ok) throw new Error(`Crossmint GET tracking → ${res.status} ${res.statusText}`);
    const t = (await res.json()) as {
      status?: string;
      packageTracking?: { carrier?: string; trackingNumber?: string };
      deliveryTimeRange?: { lowerBound?: number; upperBound?: number };
    };
    return {
      status: t.status ?? "unknown",
      carrier: t.packageTracking?.carrier,
      trackingNumber: t.packageTracking?.trackingNumber,
      etaLowerMs: t.deliveryTimeRange?.lowerBound,
      etaUpperMs: t.deliveryTimeRange?.upperBound,
    };
  }
}

/** Reference: paying for OUR OWN x402 services (gift cards via x402-store) uses
 *  the @hfsp/x402-sdk X402Client instead — same Solana USDC mint below. */
export const PAYMENT_MINT_USDC = USDC_MAINNET;
