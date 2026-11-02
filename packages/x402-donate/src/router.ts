import { ethers } from 'ethers';
import { createRequire } from 'module';
import { config, BASE_USDC } from './config.js';

const require = createRequire(import.meta.url);
const ABI = require('./abi/DonationRouter.json') as ethers.InterfaceAbi;

const ERC20_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const MAX_AGE_SECS   = 300;

// Replay protection — txHashes that have been routed this session
const routed = new Set<string>();

let _provider: ethers.JsonRpcProvider | null = null;
let _signer:   ethers.Wallet | null = null;
let _contract: ethers.Contract | null = null;

function getClients() {
  if (!_provider) _provider = new ethers.JsonRpcProvider(config.BASE_RPC_URL);
  if (!_signer)   _signer   = new ethers.Wallet(config.ROUTER_PRIVATE_KEY, _provider);
  if (!_contract) _contract = new ethers.Contract(config.ROUTER_CONTRACT_ADDRESS, ABI, _signer);
  return { provider: _provider, contract: _contract };
}

export interface RouteResult {
  ok: boolean;
  error?: string;
  paidUsdc: number;
  netToCharityUsdc: number;
  routeTxHash?: string;
}

/**
 * Verify that `txHash` sent USDC to our DonationRouter, then call route() on-chain
 * to atomically split 97% → charity and 3% → treasury.
 *
 * Legacy flow only. On the x402 V2 path the donor never broadcasts a transaction
 * of their own — the facilitator moves the USDC — so there is nothing to verify
 * here and `routeOnChain` is called from the afterSettle hook instead.
 */
export async function verifyAndRoute(
  txHash:       string,
  charityAddr:  string,
  minUsdc:      number,
): Promise<RouteResult> {
  const key = txHash.toLowerCase();

  if (routed.has(key)) {
    return { ok: false, error: 'Transaction already used for a donation', paidUsdc: 0, netToCharityUsdc: 0 };
  }

  const { provider } = getClients();

  // ── 1. Verify the donor tx ────────────────────────────────────────────────
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
    return { ok: false, error: 'RPC error — could not fetch transaction', paidUsdc: 0, netToCharityUsdc: 0 };
  }

  if (!receipt)              return { ok: false, error: 'Transaction not found on Base',       paidUsdc: 0, netToCharityUsdc: 0 };
  if (receipt.status !== 1)  return { ok: false, error: 'Transaction reverted on-chain',       paidUsdc: 0, netToCharityUsdc: 0 };

  if (block) {
    const ageSecs = Date.now() / 1000 - block.timestamp;
    if (ageSecs > MAX_AGE_SECS) {
      return { ok: false, error: `Payment expired — ${Math.round(ageSecs)}s old, max ${MAX_AGE_SECS}s`, paidUsdc: 0, netToCharityUsdc: 0 };
    }
  }

  // Sum USDC transfers to the DonationRouter contract
  const routerAddr = config.ROUTER_CONTRACT_ADDRESS.toLowerCase();
  let paidUsdc = 0;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== BASE_USDC.toLowerCase()) continue;
    if (log.topics[0] !== ERC20_TRANSFER) continue;
    const toAddr = '0x' + log.topics[2]?.slice(-40);
    if (toAddr.toLowerCase() !== routerAddr) continue;
    paidUsdc += Number(BigInt(log.data)) / 1e6;
  }

  if (paidUsdc < minUsdc * 0.95) {
    return {
      ok: false,
      error: `Underpaid: $${paidUsdc.toFixed(4)} USDC sent to router, $${minUsdc} required`,
      paidUsdc,
      netToCharityUsdc: 0,
    };
  }

  // ── 2 & 3. Replay check + route() ─────────────────────────────────────────
  const result = await routeOnChain(txHash, charityAddr, paidUsdc);
  if (result.ok) {
    routed.add(key);
    setTimeout(() => routed.delete(key), 15 * 60 * 1000);
  }
  return result;
}

/**
 * Split USDC already sitting in the DonationRouter: 97% → charity, 3% → treasury.
 *
 * `settlementId` is any 32-byte-derivable unique reference for this donation — the
 * donor's tx hash on the legacy path, the facilitator's settlement tx hash on the
 * V2 path. The contract stores it in `settled()` so the same donation cannot be
 * routed twice even if this process restarts.
 */
export async function routeOnChain(
  settlementId: string,
  charityAddr:  string,
  paidUsdc:     number,
): Promise<RouteResult> {
  const { contract } = getClients();

  const idBytes = ethers.hexlify(ethers.toBeArray(settlementId).slice(0, 32)) as `0x${string}`;
  const alreadySettled = await contract.settled(idBytes) as boolean;
  if (alreadySettled) {
    return { ok: false, error: 'Already routed on-chain', paidUsdc, netToCharityUsdc: 0 };
  }

  const amountUnits = BigInt(Math.round(paidUsdc * 1_000_000));

  let routeTx: ethers.TransactionResponse;
  try {
    routeTx = await (contract.route as (a: string, b: string, c: bigint) => Promise<ethers.TransactionResponse>)(
      idBytes,
      charityAddr,
      amountUnits,
    );
    await routeTx.wait(1);
  } catch (err) {
    return {
      ok: false,
      error: `route() call failed: ${err instanceof Error ? err.message : String(err)}`,
      paidUsdc,
      netToCharityUsdc: 0,
    };
  }

  const FEE_BPS = 300n;
  const fee = (amountUnits * FEE_BPS) / 10_000n;
  const netToCharityUsdc = Number(amountUnits - fee) / 1_000_000;

  console.log(`[router] routed $${paidUsdc} → ${charityAddr} (net $${netToCharityUsdc.toFixed(4)}) via ${routeTx.hash.slice(0, 10)}…`);

  return {
    ok: true,
    paidUsdc,
    netToCharityUsdc,
    routeTxHash: routeTx.hash,
  };
}
