const HELIUS_API_KEY = process.env.HELIUS_API_KEY ?? '';
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const HELIUS_TXS = `https://api.helius.xyz/v0/transactions?api-key=${HELIUS_API_KEY}`;
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export interface HeliusTx {
  signature: string;
  blockTime: number;
  usdcDelta: number;   // positive = received, negative = sent
  feeLamports: number;
  description?: string;
  type?: string;
}

export async function fetchWalletBalance(walletAddress: string): Promise<{ solLamports: number; usdcAmount: number }> {
  const [solRes, tokenRes] = await Promise.all([
    fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [walletAddress] }),
    }),
    fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2,
        method: 'getTokenAccountsByOwner',
        params: [walletAddress, { mint: USDC_MINT }, { encoding: 'jsonParsed' }],
      }),
    }),
  ]);

  const { result: solResult } = await solRes.json() as { result: { value: number } };
  const { result: tokenResult } = await tokenRes.json() as { result: { value: Array<{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: number } } } } } }> } };

  const solLamports: number = solResult?.value ?? 0;
  const usdcAmount: number = tokenResult?.value?.[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;

  return { solLamports, usdcAmount };
}

interface HeliusEnhancedTx {
  signature: string;
  timestamp: number;
  fee: number;
  description?: string;
  type?: string;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
  }>;
}

export async function fetchRecentUsdcTxs(walletAddress: string, limit = 50): Promise<HeliusTx[]> {
  // Step 1: get recent signatures via standard RPC
  const sigRes = await fetch(HELIUS_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'getSignaturesForAddress',
      params: [walletAddress, { limit }],
    }),
  });
  const { result: sigs } = await sigRes.json() as { result: Array<{ signature: string; blockTime: number; err: unknown }> };
  if (!sigs?.length) return [];

  const validSigs = sigs.filter(s => !s.err).map(s => s.signature);
  if (!validSigs.length) return [];

  // Step 2: fetch enriched tx details via Helius enhanced API (batches of 100)
  const results: HeliusTx[] = [];
  for (let i = 0; i < validSigs.length; i += 100) {
    const batch = validSigs.slice(i, i + 100);
    const res = await fetch(HELIUS_TXS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: batch }),
    });
    if (!res.ok) continue;
    const txs = await res.json() as HeliusEnhancedTx[];

    for (const tx of txs) {
      if (!tx.tokenTransfers?.length) continue;

      let usdcDelta = 0;
      for (const t of tx.tokenTransfers) {
        if (t.mint !== USDC_MINT) continue;
        if (t.toUserAccount === walletAddress) usdcDelta += t.tokenAmount;
        if (t.fromUserAccount === walletAddress) usdcDelta -= t.tokenAmount;
      }

      if (usdcDelta !== 0) {
        results.push({
          signature: tx.signature,
          blockTime: tx.timestamp ?? 0,
          usdcDelta,
          feeLamports: tx.fee ?? 0,
          description: tx.description,
          type: tx.type,
        });
      }
    }
  }

  return results;
}
