import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { createSession } from './db.js';

const HELIUS_KEY = process.env.HELIUS_API_KEY
  ?? process.env.SYNAPSE_RPC_URL?.match(/api-key=([^&]+)/)?.[1]
  ?? '';
const HELIUS_RPC = HELIUS_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
  : 'https://api.mainnet-beta.solana.com';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MAX_AGE_SECS = 300;

// Pricing tiers: hours → USDC
const TIERS: Record<number, { usdc: number; label: string }> = {
  1:  { usdc: 0.10, label: '1 hour'   },
  6:  { usdc: 0.50, label: '6 hours'  },
  24: { usdc: 1.50, label: '24 hours' },
};

// Replay protection — cleared after 10 min
const usedSignatures = new Set<string>();

async function verifyPayment(
  signature: string,
  recipientWallet: string,
  minUsdc: number,
): Promise<{ ok: boolean; error?: string; paid: number }> {
  if (usedSignatures.has(signature)) {
    return { ok: false, error: 'Signature already used (replay protection)', paid: 0 };
  }

  try {
    const rpcRes = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getTransaction',
        params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      }),
    });
    const { result: tx } = await rpcRes.json() as { result: Record<string, unknown> | null };

    if (!tx) return { ok: false, error: 'Transaction not found on-chain', paid: 0 };
    if ((tx.meta as Record<string, unknown>)?.err) return { ok: false, error: 'Transaction failed on-chain', paid: 0 };

    const ageSecs = Date.now() / 1000 - (tx.blockTime as number ?? 0);
    if (ageSecs > MAX_AGE_SECS) {
      return { ok: false, error: `Payment expired (${Math.round(ageSecs)}s old, max ${MAX_AGE_SECS}s)`, paid: 0 };
    }

    const post = (tx.meta as Record<string, unknown>)?.postTokenBalances as Array<Record<string, unknown>> ?? [];
    const pre  = (tx.meta as Record<string, unknown>)?.preTokenBalances  as Array<Record<string, unknown>> ?? [];

    let paid = 0;
    for (const pb of post) {
      if (pb.mint !== USDC_MINT || pb.owner !== recipientWallet) continue;
      const preBal  = (pre.find(p => p.accountIndex === pb.accountIndex)?.uiTokenAmount as Record<string, unknown>)?.uiAmount as number ?? 0;
      const postBal = (pb.uiTokenAmount as Record<string, unknown>)?.uiAmount as number ?? 0;
      paid += postBal - preBal;
    }

    if (paid < minUsdc * 0.95) {
      return { ok: false, error: `Underpaid: received $${paid.toFixed(4)} USDC, need $${minUsdc}`, paid };
    }

    usedSignatures.add(signature);
    setTimeout(() => usedSignatures.delete(signature), 600_000);
    return { ok: true, paid };
  } catch (e) {
    return { ok: false, error: `Verification error: ${e instanceof Error ? e.message : String(e)}`, paid: 0 };
  }
}

export function sessionHandler(
  walletPublicKey: string,
  proxyPort: number,
  db: Database.Database,
) {
  return async (req: Request, res: Response): Promise<void> => {
    const rawHours = req.query.hours ?? (req.body as Record<string, unknown>)?.hours ?? 1;
    const hours = parseInt(String(rawHours));
    const tier = TIERS[hours] ?? TIERS[1];
    const tierHours = TIERS[hours] ? hours : 1;
    const usdcMicro = Math.round(tier.usdc * 1_000_000).toString();

    const paymentSig = (req.headers['x-payment'] as string | undefined)?.trim();

    if (!paymentSig) {
      res.status(402).json({
        x402Version: 1,
        error: 'Payment required',
        description: `Pay ${tier.usdc} USDC on Solana to get ${tier.label} of anonymous proxy access.`,
        accepts: [{
          scheme: 'exact',
          network: 'solana-mainnet',
          maxAmountRequired: usdcMicro,
          asset: USDC_MINT,
          payTo: walletPublicKey,
          resource: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
          description: `Clawdrop VPN — ${tier.label} anonymous proxy session (HTTP CONNECT)`,
          mimeType: 'application/json',
          maxTimeoutSeconds: 300,
        }],
        tiers: Object.entries(TIERS).map(([h, t]) => ({
          hours: parseInt(h),
          usdc: t.usdc,
          label: t.label,
          endpoint: `?hours=${h}`,
        })),
      });
      return;
    }

    const { ok, error, paid } = await verifyPayment(paymentSig, walletPublicKey, tier.usdc);
    if (!ok) {
      res.status(402).json({ error });
      return;
    }

    const token = crypto.randomUUID();
    const session = createSession(db, token, tierHours, paymentSig, paid);
    const proxyHost = process.env.PUBLIC_HOST ?? req.hostname;

    console.log(`[vpn] Session created: ${tierHours}h | tx=${paymentSig.slice(0, 16)}... | token=${token.slice(0, 8)}...`);

    res.json({
      ok: true,
      token,
      expiresAt: session.expires_at,
      durationHours: tierHours,
      usdcPaid: paid,
      proxy: {
        host: proxyHost,
        port: proxyPort,
        protocol: 'http-connect',
        proxyUrl: `http://${proxyHost}:${proxyPort}`,
        auth: `Bearer ${token}`,
      },
      usage: {
        curl: `curl --proxy http://${proxyHost}:${proxyPort} --proxy-header "Proxy-Authorization: Bearer ${token}" https://ifconfig.me`,
        nodejs: `new ProxyAgent({ uri: 'http://${proxyHost}:${proxyPort}', headers: { 'Proxy-Authorization': 'Bearer ${token}' } })`,
        python: `proxies = {'http': 'http://${proxyHost}:${proxyPort}', 'https': 'http://${proxyHost}:${proxyPort}'}  # add Proxy-Authorization header`,
      },
    });
  };
}
