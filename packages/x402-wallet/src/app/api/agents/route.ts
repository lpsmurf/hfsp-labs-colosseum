import { NextResponse } from 'next/server';
import { listAgents, upsertAgent, insertTransaction } from '@/lib/db';
import { fetchRecentUsdcTxs } from '@/lib/helius';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { X402Transaction } from '@/lib/types';

export function GET() {
  const agents = listAgents();
  return NextResponse.json(agents);
}

const createSchema = z.object({
  name:          z.string().min(1).max(64),
  walletAddress: z.string().min(32),
  description:   z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const agent = upsertAgent({
    id: randomUUID(),
    status: 'active',
    ...parsed.data,
  });

  // Auto-import recent USDC txs for the new agent (fire-and-forget)
  fetchRecentUsdcTxs(agent.walletAddress, 50).then(heliusTxs => {
    for (const h of heliusTxs) {
      const tx: X402Transaction = {
        id:         randomUUID(),
        agentId:    agent.id,
        signature:  h.signature,
        product:    h.usdcDelta < 0 ? 'outgoing' : 'incoming',
        endpoint:   h.description ?? '',
        amountUsdc: Math.abs(h.usdcDelta),
        status:     'success',
        blockTime:  h.blockTime,
        meta:       undefined,
      };
      try { insertTransaction(tx); } catch { /* ignore duplicates */ }
    }
  }).catch(() => { /* ignore import errors */ });

  return NextResponse.json(agent, { status: 201 });
}
