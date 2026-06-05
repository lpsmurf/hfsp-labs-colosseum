import { NextResponse } from 'next/server';
import { listSkills, upsertSkill, toggleSkill } from '@/lib/db';
import { randomUUID } from 'crypto';
import { z } from 'zod';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get('agentId');
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 });
  return NextResponse.json(listSkills(agentId));
}

const upsertSchema = z.object({
  agentId:          z.string(),
  product:          z.enum(['vpn-x402', 'gnosis-card', 'vps-x402', 'custom']),
  name:             z.string().min(1),
  enabled:          z.boolean().default(true),
  spendCapUsdc:     z.number().positive().default(10),
  autoApproveUsdc:  z.number().nonnegative().default(1),
  periodSeconds:    z.number().positive().default(86400),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const skill = upsertSkill({ id: randomUUID(), ...parsed.data });
  return NextResponse.json(skill, { status: 201 });
}

const toggleSchema = z.object({ id: z.string(), enabled: z.boolean() });

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  toggleSkill(parsed.data.id, parsed.data.enabled);
  return NextResponse.json({ ok: true });
}
