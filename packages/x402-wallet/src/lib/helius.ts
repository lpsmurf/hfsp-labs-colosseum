const HELIUS_API_KEY = process.env.HELIUS_API_KEY ?? '';
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export interface HeliusTx {
  signature: string;
  blockTime: number;
  usdcDelta: number;   // positive = received, negative = sent
  feeLamports: number;
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

export async function fetchRecentUsdcTxs(walletAddress: string, limit = 50): Promise<HeliusTx[]> {
  // Get recent signatures
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

  // Fetch tx details in batches of 10
  const results: HeliusTx[] = [];
  const batches = [];
  for (let i = 0; i < sigs.length; i += 10) batches.push(sigs.slice(i, i + 10));

  for (const batch of batches) {
    const txRes = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2,
        method: 'getMultipleTransactions',
        params: [batch.map(s => s.signature), { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      }),
    });
    const { result: txs } = await txRes.json() as { result: Array<Record<string, unknown> | null> };

    for (let i = 0; i < batch.length; i++) {
      const tx = txs?.[i];
      if (!tx || (tx.meta as Record<string, unknown>)?.err) continue;

      const meta = tx.meta as Record<string, unknown>;
      const post = (meta?.postTokenBalances as Array<Record<string, unknown>>) ?? [];
      const pre  = (meta?.preTokenBalances  as Array<Record<string, unknown>>) ?? [];

      let usdcDelta = 0;
      for (const pb of post) {
        if (pb.mint !== USDC_MINT || pb.owner !== walletAddress) continue;
        const preBal  = ((pre.find(p => p.accountIndex === pb.accountIndex)?.uiTokenAmount as Record<string, unknown>)?.uiAmount as number) ?? 0;
        const postBal = ((pb.uiTokenAmount as Record<string, unknown>)?.uiAmount as number) ?? 0;
        usdcDelta += postBal - preBal;
      }

      if (usdcDelta !== 0) {
        results.push({
          signature: batch[i].signature,
          blockTime: batch[i].blockTime ?? 0,
          usdcDelta,
          feeLamports: (meta?.fee as number) ?? 0,
        });
      }
    }
  }

  return results;
}
