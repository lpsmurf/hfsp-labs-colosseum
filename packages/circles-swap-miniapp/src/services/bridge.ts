const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

export interface QuoteResult {
  srcAmountUsdc:      number;
  dstAmountFormatted: number;
  bridgeFeeUsdc:      number;
  estimatedFillTimeMs: number;
  depositAddress:     string;  // where user sends funds
}

export interface OrderStatus {
  orderId:   string;
  status:    'pending' | 'fulfilled' | 'failed';
  srcTxHash?: string;
  dstTxHash?: string;
}

// ── Sol → Gnosis ──────────────────────────────────────────────────────────────

export async function quoteSolToGnosis(opts: {
  amountUsdc:   number;
  gnosisAddress: string;
}): Promise<QuoteResult> {
  const res = await fetch(`${API_BASE}/bridge/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      direction:    'sol_to_gnosis',
      amountUsdc:   opts.amountUsdc,
      safeAddress:  opts.gnosisAddress,
      dstToken:     'USDC',
    }),
  });
  if (!res.ok) throw new Error((await res.json() as { error: string }).error);
  return res.json() as Promise<QuoteResult>;
}

export async function submitSolToGnosis(opts: {
  amountUsdc:    number;
  gnosisAddress: string;
  srcTxSignature: string;
}): Promise<OrderStatus> {
  const res = await fetch(`${API_BASE}/bridge/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      direction:    'sol_to_gnosis',
      amountUsdc:   opts.amountUsdc,
      safeAddress:  opts.gnosisAddress,
      srcTxSignature: opts.srcTxSignature,
    }),
  });
  if (!res.ok) throw new Error((await res.json() as { error: string }).error);
  return res.json() as Promise<OrderStatus>;
}

// ── Gnosis → Sol ──────────────────────────────────────────────────────────────

export async function quoteGnosisToSol(opts: {
  amountUsdc:    number;
  solanaAddress: string;
}): Promise<QuoteResult> {
  const res = await fetch(`${API_BASE}/bridge/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      direction:     'gnosis_to_sol',
      amountUsdc:    opts.amountUsdc,
      solanaAddress: opts.solanaAddress,
    }),
  });
  if (!res.ok) throw new Error((await res.json() as { error: string }).error);
  return res.json() as Promise<QuoteResult>;
}

export async function submitGnosisToSol(opts: {
  amountUsdc:    number;
  solanaAddress: string;
  gnosisTxHash:  string;
}): Promise<OrderStatus> {
  const res = await fetch(`${API_BASE}/bridge/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      direction:     'gnosis_to_sol',
      amountUsdc:    opts.amountUsdc,
      solanaAddress: opts.solanaAddress,
      gnosisTxHash:  opts.gnosisTxHash,
    }),
  });
  if (!res.ok) throw new Error((await res.json() as { error: string }).error);
  return res.json() as Promise<OrderStatus>;
}

export async function pollOrderStatus(orderId: string): Promise<OrderStatus> {
  const res = await fetch(`${API_BASE}/bridge/status/${encodeURIComponent(orderId)}`);
  if (!res.ok) throw new Error('Failed to fetch order status');
  return res.json() as Promise<OrderStatus>;
}
