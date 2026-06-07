import { ethers } from 'ethers';
import { config, BASE_USDC } from './config.js';

const MAX_AGE_SECS   = 300; // payment must be <5 min old
const ERC20_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Replay protection — keep spent hashes in memory for 15 min
const usedHashes = new Set<string>();

export async function verifyBasePayment(
  txHash:         string,
  recipientAddr:  string,
  minUsdc:        number,
): Promise<{ ok: boolean; error?: string; paidUsdc: number }> {
  if (usedHashes.has(txHash.toLowerCase())) {
    return { ok: false, error: 'Transaction already used for a donation', paidUsdc: 0 };
  }

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
    return { ok: false, error: 'RPC error — could not fetch transaction', paidUsdc: 0 };
  }

  if (!receipt)          return { ok: false, error: 'Transaction not found on Base', paidUsdc: 0 };
  if (receipt.status !== 1) return { ok: false, error: 'Transaction reverted on-chain', paidUsdc: 0 };

  if (block) {
    const ageSecs = Date.now() / 1000 - block.timestamp;
    if (ageSecs > MAX_AGE_SECS) {
      return { ok: false, error: `Payment expired — ${Math.round(ageSecs)}s old, max ${MAX_AGE_SECS}s`, paidUsdc: 0 };
    }
  }

  // Sum all USDC Transfer events to recipientAddr
  const recipient = recipientAddr.toLowerCase();
  let paidUsdc = 0;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== BASE_USDC.toLowerCase()) continue;
    if (log.topics[0] !== ERC20_TRANSFER) continue;
    // topics[2] is the `to` address, zero-padded to 32 bytes
    const toAddr = '0x' + log.topics[2]?.slice(-40);
    if (toAddr.toLowerCase() !== recipient) continue;
    paidUsdc += Number(BigInt(log.data)) / 1e6;
  }

  if (paidUsdc < minUsdc * 0.95) {
    return {
      ok: false,
      error: `Underpaid: $${paidUsdc.toFixed(4)} USDC received, $${minUsdc} required`,
      paidUsdc,
    };
  }

  usedHashes.add(txHash.toLowerCase());
  setTimeout(() => usedHashes.delete(txHash.toLowerCase()), 15 * 60 * 1000);

  return { ok: true, paidUsdc };
}
