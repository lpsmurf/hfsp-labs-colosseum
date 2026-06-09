import { NextResponse } from 'next/server';
import { fetchServices } from '@/lib/marketplace';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query    = searchParams.get('q')        ?? undefined;
  const category = searchParams.get('category') ?? undefined;

  const services = await fetchServices(query, category);
  return NextResponse.json(services);
}
