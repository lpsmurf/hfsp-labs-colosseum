/**
 * providers.ts — the swappable provider-adapter layer.
 *
 * Every external dependency the agent has (price data, checkout, LLM inference,
 * email) sits behind a narrow interface here, so we can swap implementations
 * without touching the autonomy loop:
 *
 *   PriceProvider    Keepa        →  (later) Rainforest
 *   CheckoutProvider Crossmint    →  (later) Zinc
 *   LlmGateway       BlockRun     →  (later) self-hosted x402 gateway
 *   MailProvider     AgentMail    →  (later) anything that gives an inbox-per-agent
 *
 * Telegram is NOT here — it is reused as-is from packages/clawdrop-agent-runtime
 * (grammy Bot), which already implements the per-agent messaging interface.
 *
 * Nothing in this file makes a network call. It is the contract the concrete
 * client stubs implement.
 */

// ─── USDC money helpers (Solana USDC has 6 decimals) ─────────────────────────

/** Mainnet USDC mint on Solana (same constant the @hfsp/x402-sdk uses). */
export const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;

/** $1.23 → 1_230_000n atomic units. Throws on >6 decimal places. */
export function toAtomicUsdc(dollars: number): bigint {
  const scaled = Math.round(dollars * 10 ** USDC_DECIMALS);
  if (!Number.isFinite(scaled)) throw new Error(`toAtomicUsdc: invalid amount ${dollars}`);
  return BigInt(scaled);
}

/** 1_230_000n → "1.23" for human-readable display/receipts. */
export function fromAtomicUsdc(atomic: bigint): string {
  const neg = atomic < 0n;
  const abs = neg ? -atomic : atomic;
  const whole = abs / 10n ** BigInt(USDC_DECIMALS);
  const frac = (abs % 10n ** BigInt(USDC_DECIMALS)).toString().padStart(USDC_DECIMALS, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

// ─── LLM gateway (BlockRun SolanaLLMClient, x402 pay-per-request) ─────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface LlmGateway {
  /**
   * Run a chat completion and return the assistant text. The implementation
   * pays for the call itself over x402 (Solana USDC) — no API key, the agent's
   * own wallet settles each request.
   */
  chat(model: string, messages: ChatMessage[]): Promise<string>;
}

// ─── Price provider (Keepa today, Rainforest later) ──────────────────────────

export interface PricePoint {
  /** Unix ms. */
  at: number;
  /** USD, e.g. 19.99. null means "no data / out of stock" at that point. */
  priceUsd: number | null;
}

export interface ProductSnapshot {
  asin: string;
  title?: string;
  /** Current Amazon/new price in USD, or null if unavailable. */
  currentUsd: number | null;
  /** Min observed price over the stats window, USD. */
  minUsd?: number | null;
  /** Recent price history, oldest → newest. */
  history?: PricePoint[];
}

export interface PriceProvider {
  /** One-shot snapshot of an ASIN (current + stats + optional history). */
  getProduct(asin: string): Promise<ProductSnapshot>;
}

// ─── Checkout provider (Crossmint today, Zinc later) ─────────────────────────

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2, e.g. "US". */
  country: string;
}

export interface PurchaseRequest {
  /** Provider-agnostic product reference. For Crossmint Amazon: `amazon:<ASIN>`. */
  productLocator: string;
  recipientEmail: string;
  shipTo: ShippingAddress;
  /** Hard ceiling. The provider/quote must not exceed this or the buy aborts. */
  maxTotalUsd: number;
}

export interface OrderResult {
  orderId: string;
  /** Provider lifecycle phase, e.g. "quote" | "payment" | "delivery" | "completed". */
  phase: string;
  /** Quoted all-in total in USD, if the provider returned one. */
  totalUsd?: number;
  /** Base64 transaction the buyer must sign + submit (Crossmint headless flow). */
  serializedTransaction?: string;
}

export interface OrderTracking {
  status: string;
  carrier?: string;
  trackingNumber?: string;
  etaLowerMs?: number;
  etaUpperMs?: number;
}

export interface CheckoutProvider {
  /** Create the order (returns a quote + a tx to sign for crypto checkout). */
  createOrder(req: PurchaseRequest): Promise<OrderResult>;
  /** Sign the returned transaction with the agent wallet and submit payment. */
  payOrder(order: OrderResult): Promise<{ txSig: string }>;
  /** Poll fulfillment/shipping status. */
  getTracking(orderId: string): Promise<OrderTracking>;
}

// ─── Mail provider (AgentMail) ───────────────────────────────────────────────

export interface InboxRef {
  inboxId: string;
  /** Full address, e.g. "shopper-ab12@agent.hfsp.xyz". */
  address: string;
}

export interface InboundMessage {
  messageId: string;
  threadId?: string;
  from: string;
  subject?: string;
  /** Best-effort plain text (AgentMail `text` or extracted body). */
  text: string;
}

export interface MailProvider {
  /** Provision a dedicated inbox for one agent. Idempotent on clientId. */
  createInbox(clientId: string): Promise<InboxRef>;
  /** Send a fresh message from the agent's inbox. */
  send(inboxId: string, to: string, subject: string, body: { text?: string; html?: string }): Promise<{ messageId: string }>;
  /** Pull recent inbound messages (poll fallback when not using webhooks). */
  listInbound(inboxId: string, limit?: number): Promise<InboundMessage[]>;
  /** Reply in-thread to a received message. */
  reply(inboxId: string, messageId: string, body: { text?: string; html?: string }): Promise<{ messageId: string }>;
}
