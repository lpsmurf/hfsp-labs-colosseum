import { config } from "../config.js";
import type { OrderBook } from "../types.js";

// Polymarket CLOB order book reader. GET /book?token_id=<id> returns
// { bids: [{price, size}], asks: [{price, size}] } with prices as strings 0..1.
interface RawLevel { price: string; size: string }
interface RawBook  { bids?: RawLevel[]; asks?: RawLevel[] }

export async function fetchBook(tokenId: string): Promise<OrderBook> {
  const empty: OrderBook = { tokenId, bestBid: null, bestAsk: null, spread: null };
  const res = await fetch(
    `${config.clobUrl}/book?token_id=${encodeURIComponent(tokenId)}`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) },
  ).catch(() => null);
  if (!res?.ok) return empty;

  const book = (await res.json().catch(() => null)) as RawBook | null;
  if (!book) return empty;

  // Best ask = lowest ask price (what you pay to BUY). Best bid = highest bid.
  const asks = (book.asks ?? []).map((l) => Number(l.price)).filter((n) => n > 0 && n < 1);
  const bids = (book.bids ?? []).map((l) => Number(l.price)).filter((n) => n > 0 && n < 1);
  const bestAsk = asks.length ? Math.min(...asks) : null;
  const bestBid = bids.length ? Math.max(...bids) : null;
  const spread  = bestAsk !== null && bestBid !== null ? bestAsk - bestBid : null;

  return { tokenId, bestBid, bestAsk, spread };
}

/** Fetch books for many tokens, tolerating per-token failures. */
export async function fetchBooks(tokenIds: string[]): Promise<Map<string, OrderBook>> {
  const entries = await Promise.all(tokenIds.map(async (id) => [id, await fetchBook(id)] as const));
  return new Map(entries);
}
