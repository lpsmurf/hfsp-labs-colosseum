import { NextResponse } from 'next/server';
import { listTransactions, insertTransaction } from '@/lib/db';
import { fetchRecentUsdcTxs } from '@/lib/helius';
import { randomUUID } from 'crypto';
import type { X402Transaction } from '@/lib/types';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get('agentId') ?? undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 500);
  const txs = listTransactions(agentId, limit);
  return NextResponse.json(txs);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { agentId?: string; walletAddress?: string } | null;
  if (!body?.agentId || !body?.walletAddress) {
    return NextResponse.json({ error: 'agentId and walletAddress required' }, { status: 400 });
  }

  const heliusTxs = await fetchRecentUsdcTxs(body.walletAddress, 50);
  let imported = 0;

  for (const h of heliusTxs) {
    if (h.usdcDelta >= 0) continue; // only outgoing = payments made
    const tx: X402Transaction = {
      id:         randomUUID(),
      agentId:    body.agentId,
      signature:  h.signature,
      product:    'unknown',
      endpoint:   '',
      amountUsdc: Math.abs(h.usdcDelta),
      status:     'success',
      blockTime:  h.blockTime,
      meta:       null ?? undefined,
    };
    try {
      insertTransaction(tx);
      imported++;
    } catch { /* ignore duplicates */ }
  }

  return NextResponse.json({ imported, total: heliusTxs.length });
}
