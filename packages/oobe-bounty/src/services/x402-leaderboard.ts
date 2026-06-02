/**
 * x402-gated leaderboard service.
 *
 * GET /api/leaderboard          → 402 Payment Required (payment details JSON)
 * GET /api/leaderboard?window=48 → same, for last-N-hours view
 *
 * With X-Payment: <solana-tx-signature> header:
 *   → verifies 0.01 USDC was sent to our wallet on-chain → returns live leaderboard
 */

import type { Request, Response } from 'express';

const HELIUS_KEY = process.env.HELIUS_API_KEY
  ?? process.env.SOLANA_MAINNET_RPC?.match(/api-key=([^&]+)/)?.[1]
  ?? 'b72c1253-4c5d-441b-8b54-46b08d10d447';
const HELIUS_BASE = `https://api.helius.xyz/v0`;
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const SAP_AGENTS_API = 'https://explorer.oobeprotocol.ai/api/sap/agents?limit=200';
const FACILITATOR = '5iVXFrYaYWX2GUTbkQj8mDBoBhAX8bneYigS2LJTia43';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PRICE_USDC = 0.01;           // price callers pay to query leaderboard
const MIN_USDC = PRICE_USDC * 0.9; // 10% tolerance
const MAX_AGE_SECS = 300;          // payment must be < 5 min old
const CACHE_TTL_MS = 120_000;      // cache leaderboard for 2 minutes

// ── Cache ──────────────────────────────────────────────────────────────────

type CacheEntry = { data: LeaderboardEntry[]; ts: number };
const cache = new Map<number, CacheEntry>();
const usedSignatures = new Set<string>(); // replay protection

// ── Types ──────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  rank: number;
  name: string;
  wallet: string;
  txns: number;
  usdcVolume: number;
  lastPaymentAt: string | null;
}

// ── Payment verification ────────────────────────────────────────────────────

async function verifyPayment(signature: string, recipientWallet: string): Promise<string | null> {
  if (usedSignatures.has(signature)) return 'Payment signature already used (replay)';

  try {
    const res = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getTransaction',
        params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      }),
    });
    const { result: tx } = await res.json() as { result: Record<string, unknown> | null };
    if (!tx) return 'Transaction not found on-chain';
    if ((tx.meta as Record<string, unknown>)?.err) return 'Transaction failed on-chain';

    const blockTime = tx.blockTime as number;
    if (Date.now() / 1000 - blockTime > MAX_AGE_SECS) {
      return `Payment too old (${Math.round(Date.now() / 1000 - blockTime)}s, max ${MAX_AGE_SECS}s)`;
    }

    // Verify USDC transfer to our wallet
    const post = (tx.meta as Record<string, unknown>)?.postTokenBalances as Array<Record<string, unknown>> ?? [];
    const pre  = (tx.meta as Record<string, unknown>)?.preTokenBalances  as Array<Record<string, unknown>> ?? [];

    let paid = 0;
    for (const pb of post) {
      if (pb.mint !== USDC_MINT) continue;
      if (pb.owner !== recipientWallet) continue;
      const preBal = (pre.find((p: Record<string, unknown>) => p.accountIndex === pb.accountIndex)
        ?.uiTokenAmount as Record<string, unknown>)?.uiAmount as number ?? 0;
      const postBal = (pb.uiTokenAmount as Record<string, unknown>)?.uiAmount as number ?? 0;
      paid += postBal - preBal;
    }

    if (paid < MIN_USDC) return `Insufficient payment: received $${paid.toFixed(4)} USDC, need $${PRICE_USDC}`;

    usedSignatures.add(signature);
    // Evict old signatures after 10 min to keep set bounded
    setTimeout(() => usedSignatures.delete(signature), 600_000);
    return null; // success
  } catch (e) {
    return `Verification error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ── Leaderboard query ───────────────────────────────────────────────────────

async function fetchLeaderboard(windowHours: number): Promise<LeaderboardEntry[]> {
  const cached = cache.get(windowHours);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const sinceTs = windowHours ? Math.floor(Date.now() / 1000) - windowHours * 3600 : 0;

  const sapRes = await fetch(SAP_AGENTS_API);
  const sapData = await sapRes.json() as { agents: Array<Record<string, unknown>> };
  const agents = sapData.agents.map(a => {
    const identity = a.identity as Record<string, unknown>;
    return { name: String(identity?.name ?? 'Unknown'), wallet: String(identity?.wallet ?? '') };
  }).filter(a => a.wallet);

  const seen = new Set<string>();
  const results: LeaderboardEntry[] = [];

  for (const { name, wallet } of agents) {
    if (seen.has(name)) continue;
    seen.add(name);

    let count = 0, volume = 0, lastPaymentAt: string | null = null, cursor: string | undefined;
    outer: while (true) {
      const url = `${HELIUS_BASE}/addresses/${wallet}/transactions?api-key=${HELIUS_KEY}&limit=100&type=TRANSFER${cursor ? '&before=' + cursor : ''}`;
      const txRes = await fetch(url);
      const txs = await txRes.json() as Array<Record<string, unknown>>;
      if (!Array.isArray(txs) || txs.length === 0) break;
      for (const tx of txs) {
        const ts = tx.timestamp as number ?? 0;
        if (sinceTs && ts < sinceTs) break outer;
        for (const t of (tx.tokenTransfers as Array<Record<string, unknown>> ?? [])) {
          if (t.mint === USDC_MINT && t.toUserAccount === FACILITATOR) {
            if (!lastPaymentAt) lastPaymentAt = new Date(ts * 1000).toISOString();
            count++;
            volume += t.tokenAmount as number ?? 0;
          }
        }
      }
      cursor = String((txs[txs.length - 1] as Record<string, unknown>)?.signature ?? '');
      if (txs.length < 100) break;
      await new Promise(r => setTimeout(r, 200));
    }

    results.push({ rank: 0, name, wallet: wallet.slice(0, 8) + '...', txns: count, usdcVolume: volume, lastPaymentAt });
  }

  results.sort((a, b) => b.txns - a.txns || b.usdcVolume - a.usdcVolume);
  results.forEach((r, i) => { r.rank = i + 1; });

  const data = results.filter(r => r.txns > 0);
  cache.set(windowHours, { data, ts: Date.now() });
  return data;
}

// ── Express handler ─────────────────────────────────────────────────────────

export function leaderboardHandler(recipientWallet: string) {
  return async (req: Request, res: Response): Promise<void> => {
    const windowHours = parseInt(String(req.query.window ?? '0')) || 0;
    const paymentHeader = req.headers['x-payment'] as string | undefined;

    // No payment → return 402 with payment details
    if (!paymentHeader) {
      res.status(402).json({
        x402Version: 1,
        error: 'Payment required',
        accepts: [{
          scheme: 'exact',
          network: 'solana-mainnet',
          maxAmountRequired: String(Math.round(PRICE_USDC * 1_000_000)),
          asset: USDC_MINT,
          payTo: recipientWallet,
          resource: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
          description: 'OOBE Bounty live leaderboard — ranked by on-chain x402 payments to AceDataCloud',
          mimeType: 'application/json',
          maxTimeoutSeconds: 60,
        }],
      });
      return;
    }

    // Verify payment
    const signature = paymentHeader.trim();
    const verifyError = await verifyPayment(signature, recipientWallet);
    if (verifyError) {
      res.status(402).json({ error: verifyError });
      return;
    }

    // Return leaderboard
    try {
      const leaderboard = await fetchLeaderboard(windowHours);
      res.json({
        generatedAt: new Date().toISOString(),
        window: windowHours ? `last ${windowHours}h` : 'all-time',
        cachedForSeconds: CACHE_TTL_MS / 1000,
        paymentSignature: signature,
        leaderboard,
      });
    } catch (e) {
      res.status(500).json({ error: 'Leaderboard fetch failed', detail: String(e) });
    }
  };
}
