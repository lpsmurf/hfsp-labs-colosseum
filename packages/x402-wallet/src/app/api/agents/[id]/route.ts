import { NextResponse } from 'next/server';
import { getAgent, setAgentStatus, listSkills, getSpendSummary } from '@/lib/db';
import { fetchWalletBalance } from '@/lib/helius';
import { z } from 'zod';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const agent = getAgent(params.id);
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const [skills, spend, balance] = await Promise.all([
    Promise.resolve(listSkills(agent.id)),
    Promise.resolve(getSpendSummary(agent.id)),
    fetchWalletBalance(agent.walletAddress).catch(() => ({ solLamports: 0, usdcAmount: 0 })),
  ]);

  return NextResponse.json({ agent, skills, spend, balance });
}

const patchSchema = z.object({ status: z.enum(['active', 'paused', 'stopped']) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const agent = getAgent(params.id);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  setAgentStatus(params.id, parsed.data.status);
  return NextResponse.json({ ok: true });
}
