/**
 * /api/card/safe — inspect a destination address on Gnosis Chain.
 *
 * Lets the frontend recognise what the user pasted:
 *   - regular wallet (EOA, no contract code)
 *   - a Safe (Gnosis Safe proxy — responds to VERSION())
 *   - which Gnosis tokens it already holds (USDC / EURe / GBPe)
 *
 * Gnosis Pay card accounts are Safes that typically hold EURe/GBPe/USDC, so a
 * Safe holding those is flagged as a likely Gnosis Pay account. This is a
 * best-effort heuristic — no private data, only public on-chain reads.
 */

import { Router } from 'express';
import { ethers } from 'ethers';
import { config, GNOSIS_TOKENS, type GnosisToken } from '../config.js';

export const safeRouter = Router();

const provider = new ethers.JsonRpcProvider(config.GNOSIS_RPC_URL);

// Minimal ABIs
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'];
const SAFE_ABI = ['function VERSION() view returns (string)', 'function getThreshold() view returns (uint256)'];

const TOKEN_DECIMALS: Record<GnosisToken, number> = { USDC: 6, EURe: 18, GBPe: 18 };

async function readBalances(address: string) {
  const entries = await Promise.all(
    (Object.keys(GNOSIS_TOKENS) as GnosisToken[]).map(async (sym) => {
      try {
        const erc20 = new ethers.Contract(GNOSIS_TOKENS[sym], ERC20_ABI, provider);
        const raw = await erc20.balanceOf(address) as bigint;
        const formatted = Number(ethers.formatUnits(raw, TOKEN_DECIMALS[sym]));
        return [sym, { raw: raw.toString(), formatted: Number(formatted.toFixed(4)) }] as const;
      } catch {
        return [sym, { raw: '0', formatted: 0 }] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as Record<GnosisToken, { raw: string; formatted: number }>;
}

async function detectSafe(address: string): Promise<{ isSafe: boolean; version: string | null }> {
  try {
    const safe = new ethers.Contract(address, SAFE_ABI, provider);
    const version = await safe.VERSION() as string;
    // Sanity check: a real Safe also exposes getThreshold()
    await safe.getThreshold();
    return { isSafe: true, version };
  } catch {
    return { isSafe: false, version: null };
  }
}

// GET /api/card/safe/inspect?address=0x...
safeRouter.get('/inspect', async (req, res) => {
  const address = String(req.query.address ?? '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    res.status(400).json({ ok: false, error: 'Invalid address' });
    return;
  }

  try {
    const code = await provider.getCode(address);
    const isContract = code !== '0x' && code !== '0x0';

    const [{ isSafe, version }, balances] = await Promise.all([
      isContract ? detectSafe(address) : Promise.resolve({ isSafe: false, version: null }),
      readBalances(address),
    ]);

    const holdsGnosisPayTokens = balances.EURe.formatted > 0 || balances.GBPe.formatted > 0;
    const holdsAny = holdsGnosisPayTokens || balances.USDC.formatted > 0;

    // Classify for the UI
    let kind: 'gnosispay' | 'safe' | 'wallet';
    if (isSafe && holdsGnosisPayTokens) kind = 'gnosispay';
    else if (isSafe) kind = 'safe';
    else kind = 'wallet';

    res.json({
      ok: true,
      address,
      isContract,
      isSafe,
      safeVersion: version,
      kind,
      holdsAny,
      balances,
    });
  } catch (err: unknown) {
    res.status(502).json({ ok: false, error: `Inspection failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});
