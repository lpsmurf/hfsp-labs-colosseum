import { NextResponse } from 'next/server';
import { listAgents, upsertAgent } from '@/lib/db';
import { randomUUID } from 'crypto';
import { z } from 'zod';

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
  return NextResponse.json(agent, { status: 201 });
}
