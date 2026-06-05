import { NextResponse } from 'next/server';
import { fetchWalletBalance, fetchRecentUsdcTxs } from '@/lib/helius';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address');
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 });

  const [balance, txs] = await Promise.all([
    fetchWalletBalance(address),
    fetchRecentUsdcTxs(address, 20),
  ]);

  return NextResponse.json({ address, balance, recentTxs: txs });
}
