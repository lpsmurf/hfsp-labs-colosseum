import { ethers } from 'ethers';
import { config, BASE_USDC, AUDIT_PRICE_USDC } from './config.js';

const ERC20_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const MAX_AGE_SECS   = 300;
const used           = new Set<string>();

export async function verifyPayment(
  txHash: string,
): Promise<{ ok: boolean; error?: string }> {
  const key = txHash.toLowerCase();
  if (used.has(key)) return { ok: false, error: 'Transaction already used' };

  const provider = new ethers.JsonRpcProvider(config.BASE_RPC_URL);

  let receipt: ethers.TransactionReceipt | null;
  let block:   ethers.Block | null;

  try {
    [receipt, block] = await Promise.all([
      provider.getTransactionReceipt(txHash),
      provider.getTransaction(txHash).then(tx =>
        tx?.blockNumber ? provider.getBlock(tx.blockNumber) : null
      ),
    ]);
  } catch {
    return { ok: false, error: 'RPC error fetching transaction' };
  }

  if (!receipt)             return { ok: false, error: 'Transaction not found on Base' };
  if (receipt.status !== 1) return { ok: false, error: 'Transaction reverted' };

  if (block) {
    const age = Date.now() / 1000 - block.timestamp;
    if (age > MAX_AGE_SECS) return { ok: false, error: `Payment expired (${Math.round(age)}s old)` };
  }

  const recipient = config.PAYMENT_RECIPIENT.toLowerCase();
  let paid = 0;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== BASE_USDC.toLowerCase()) continue;
    if (log.topics[0] !== ERC20_TRANSFER) continue;
    const to = '0x' + log.topics[2]?.slice(-40);
    if (to.toLowerCase() !== recipient) continue;
    paid += Number(BigInt(log.data)) / 1e6;
  }

  if (paid < AUDIT_PRICE_USDC * 0.95) {
    return { ok: false, error: `Underpaid: $${paid.toFixed(4)} received, $${AUDIT_PRICE_USDC} required` };
  }

  used.add(key);
  setTimeout(() => used.delete(key), 15 * 60 * 1000);
  return { ok: true };
}
