// Rules that decide whether an on-chain transaction pays a checkout order.
// Kept free of I/O so they can be tested without a chain or configuration.
import { ethers } from "ethers";
import { fromDataSuffix } from "@celo/attribution-tags";

// A transfer mined this long after its quote expired is still honoured; beyond
// it the price may no longer cover fulfilment.
export const GRACE_SECONDS = 120;

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

/** ERC-8021 code binding a transfer to one order (codes match ^[a-z0-9_]{1,32}$). */
export const orderCode = (id: string) => `o${id}`;

export interface ObservedPayment {
  from: string;
  to: string | null;
  data: string;
  status: number | null;
  logs: Array<{ address: string; topics: string[]; data: string }>;
  blockTimestamp?: number;
}

/**
 * Does this confirmed transaction pay this checkout order? Returns the reason
 * it does not, or null. Pure, so the rules are testable without a chain:
 * succeeded on-chain; a direct call to the quoted token; carries our attribution
 * tag and this order's code; the token's own Transfer event moved at least the
 * quoted amount from the sender to the store; mined before the quote expired
 * (plus grace). The calldata amount is never trusted — only the event.
 */
export function verifyCheckoutPayment(
  order: { orderId: string; token: string; payTo: string; expiresAt: number; lock: { priceAtomic: string } },
  tx: ObservedPayment,
  attributionTag: string,
): string | null {
  if (tx.status !== 1) return "Transaction failed on-chain.";
  if (tx.to?.toLowerCase() !== order.token.toLowerCase()) return "Transaction is not a transfer of the quoted token.";
  let codes: string[] = [];
  try { codes = fromDataSuffix(tx.data as `0x${string}`)?.codes ?? []; } catch { codes = []; }
  if (!codes.includes(orderCode(order.orderId)) || !codes.includes(attributionTag)) {
    return "Transaction does not carry this order's reference.";
  }
  const same = (a: string, b: string) => { try { return ethers.getAddress(a) === ethers.getAddress(b); } catch { return false; } };
  const paid = tx.logs.some(l =>
    l.address.toLowerCase() === order.token.toLowerCase()
    && l.topics.length === 3
    && l.topics[0] === TRANSFER_TOPIC
    && same(ethers.dataSlice(l.topics[1], 12), tx.from)
    && same(ethers.dataSlice(l.topics[2], 12), order.payTo)
    && BigInt(l.data) >= BigInt(order.lock.priceAtomic));
  if (!paid) return "No transfer of the quoted amount to the store was found in this transaction.";
  if (tx.blockTimestamp === undefined || tx.blockTimestamp > order.expiresAt + GRACE_SECONDS) {
    return "Payment arrived after the quote expired. Contact info@hfsp.xyz for a refund.";
  }
  return null;
}
