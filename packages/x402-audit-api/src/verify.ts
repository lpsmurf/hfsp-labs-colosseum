import { ethers } from 'ethers';
import { config, BASE_USDC, SOLANA_USDC_MINT, AUDIT_PRICE_USDC } from './config.js';

const ERC20_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const MAX_AGE_SECS   = 300;
const used           = new Set<string>();

// Solana signatures are base58, ~87-88 chars, no 0x prefix.
// Base tx hashes are 0x + 64 hex chars.
function detectChain(txHash: string): 'base' | 'solana' {
  return txHash.startsWith('0x') ? 'base' : 'solana';
}

export async function verifyPayment(
  txHash: string,
): Promise<{ ok: boolean; error?: string; chain?: 'base' | 'solana' }> {
  const key = txHash.toLowerCase();
  if (used.has(key)) return { ok: false, error: 'Transaction already used' };

  const chain = detectChain(txHash);
  const result = chain === 'base'
    ? await verifyBase(txHash)
    : await verifySolana(txHash);

  if (result.ok) {
    used.add(key);
    setTimeout(() => used.delete(key), 15 * 60 * 1000);
  }

  return { ...result, chain };
}

// ── Base (EVM) ────────────────────────────────────────────────────────────────

async function verifyBase(txHash: string): Promise<{ ok: boolean; error?: string }> {
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
    return { ok: false, error: 'Base RPC error fetching transaction' };
  }

  if (!receipt)             return { ok: false, error: 'Transaction not found on Base' };
  if (receipt.status !== 1) return { ok: false, error: 'Transaction reverted on Base' };

  if (block) {
    const age = Date.now() / 1000 - block.timestamp;
    if (age > MAX_AGE_SECS) return { ok: false, error: `Payment expired (${Math.round(age)}s old)` };
  }

  const recipient = config.PAYMENT_RECIPIENT_BASE.toLowerCase();
  let paid = 0;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== BASE_USDC.toLowerCase()) continue;
    if (log.topics[0] !== ERC20_TRANSFER) continue;
    const to = '0x' + log.topics[2]?.slice(-40);
    if (to.toLowerCase() !== recipient) continue;
    paid += Number(BigInt(log.data)) / 1e6;
  }

  if (paid < AUDIT_PRICE_USDC * 0.95) {
    return { ok: false, error: `Underpaid on Base: $${paid.toFixed(4)} received, $${AUDIT_PRICE_USDC} required` };
  }

  return { ok: true };
}

// ── Solana ────────────────────────────────────────────────────────────────────

async function verifySolana(signature: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(config.SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method:  'getTransaction',
        params:  [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const { result: tx } = await res.json() as { result: Record<string, unknown> | null };

    if (!tx)                                        return { ok: false, error: 'Transaction not found on Solana' };
    if ((tx.meta as Record<string, unknown>)?.err)  return { ok: false, error: 'Transaction failed on Solana' };

    const blockTime = tx.blockTime as number ?? 0;
    const age = Date.now() / 1000 - blockTime;
    if (age > MAX_AGE_SECS) {
      return { ok: false, error: `Payment expired (${Math.round(age)}s old, max ${MAX_AGE_SECS}s)` };
    }

    // Sum USDC received by our recipient wallet
    const meta      = tx.meta as Record<string, unknown>;
    const postBals  = (meta.postTokenBalances  as Array<Record<string, unknown>>) ?? [];
    const preBals   = (meta.preTokenBalances   as Array<Record<string, unknown>>) ?? [];
    const recipient = config.PAYMENT_RECIPIENT_SOL;

    let paid = 0;
    for (const pb of postBals) {
      if (pb.mint !== SOLANA_USDC_MINT)  continue;
      if (pb.owner !== recipient)        continue;
      const pre = preBals.find(p => p.accountIndex === pb.accountIndex);
      const preAmt  = ((pre?.uiTokenAmount  as Record<string, unknown>)?.uiAmount  as number) ?? 0;
      const postAmt = ((pb.uiTokenAmount    as Record<string, unknown>)?.uiAmount  as number) ?? 0;
      paid += postAmt - preAmt;
    }

    if (paid < AUDIT_PRICE_USDC * 0.95) {
      return { ok: false, error: `Underpaid on Solana: $${paid.toFixed(4)} received, $${AUDIT_PRICE_USDC} required` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Solana RPC error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
