import { Router } from 'express';
import { z } from 'zod';
import { makeX402Gate } from '../middleware/x402.js';
import { BRIDGE_TARGETS, type BridgeDestChain, type SourceChain } from '../config.js';
import { isSpent, markSpent } from '../services/nullifier.js';
import { createAndSubmitGenericOrder, getGenericQuote, getOrderStatus } from '../services/bridge.js';

export const bridgeRouter = Router();

const chainEnum = z.enum(['polygon', 'gnosis', 'base', 'arbitrum', 'ethereum']);
const sourceChainEnum = z.enum(['solana', 'base']).default('solana');

const quoteQuerySchema = z.object({
  amount: z.string().transform(Number).pipe(z.number().min(1).max(10_000)),
  recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid recipient address'),
  destChain: chainEnum,
  destToken: z.string().min(2).default('USDC'),
  sourceChain: sourceChainEnum,
});

const executeBodySchema = z.object({
  amount: z.number().min(1).max(10_000),
  recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  destChain: chainEnum,
  destToken: z.string().min(2).default('USDC'),
  sourceChain: sourceChainEnum,
});

bridgeRouter.get('/targets', (_req, res) => {
  res.json({ ok: true, targets: BRIDGE_TARGETS });
});

bridgeRouter.get('/quote', async (req, res) => {
  const parsed = quoteQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid params', details: parsed.error.flatten().fieldErrors });
    return;
  }

  try {
    const quote = await getGenericQuote({
      srcAmountUsdc: parsed.data.amount,
      destChain: parsed.data.destChain as BridgeDestChain,
      destToken: parsed.data.destToken,
      recipient: parsed.data.recipient,
      sourceChain: parsed.data.sourceChain as SourceChain,
    });
    res.json({ ok: true, quote });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Bridge quote unavailable: ${msg}` });
  }
});

bridgeRouter.post(
  '/',
  makeX402Gate({
    amountUsdc: (req) => {
      const n = Number(req.body?.amount);
      return Number.isNaN(n) || n < 1 ? 1 : n;
    },
    description: (req) =>
      `HFSP bridge relayer - ${req.body?.amount ?? '?'} USDC to ${req.body?.destChain ?? 'destination'} ${req.body?.destToken ?? 'USDC'}`,
    resource: '/api/bridge',
  }),
  async (req, res) => {
    const parsed = executeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { signature } = res.locals.payment as { paidUsdc: number; signature: string; chain: string };
    if (await isSpent(signature)) {
      res.status(409).json({ error: 'Payment already used' });
      return;
    }

    try {
      await markSpent(signature);
      const order = await createAndSubmitGenericOrder({
        srcAmountUsdc: parsed.data.amount,
        destChain: parsed.data.destChain as BridgeDestChain,
        destToken: parsed.data.destToken,
        recipient: parsed.data.recipient,
        sourceChain: parsed.data.sourceChain as SourceChain,
      });
      res.status(202).json({
        ok: true,
        orderId: order.orderId,
        status: order.status,
        sourceTx: order.srcTxHash ?? null,
        destinationTx: order.dstTxHash ?? null,
        statusId: order.orderId,
        poll: `/api/bridge/${encodeURIComponent(order.orderId)}?destChain=${parsed.data.destChain}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: `Bridge submission failed: ${msg}` });
    }
  },
);

bridgeRouter.get('/:orderId', async (req, res) => {
  const { orderId } = req.params;
  const destChain = req.query.destChain;
  if (!orderId) {
    res.status(400).json({ error: 'Missing orderId' });
    return;
  }

  try {
    const status = await getOrderStatus(orderId);
    res.json({
      ok: true,
      orderId: status.orderId,
      status: status.status,
      sourceTx: status.srcTxHash ?? null,
      destinationTx: status.dstTxHash ?? null,
      sourceExplorer: status.srcTxHash ? `https://solscan.io/tx/${status.srcTxHash}` : null,
      destinationExplorer: typeof destChain === 'string' && status.dstTxHash
        ? `${getExplorerBase(destChain)}/${status.dstTxHash}`
        : null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Status check failed: ${msg}` });
  }
});

function getExplorerBase(destChain: string) {
  switch (destChain) {
    case 'polygon': return 'https://polygonscan.com/tx';
    case 'gnosis': return 'https://gnosisscan.io/tx';
    case 'base': return 'https://basescan.org/tx';
    case 'arbitrum': return 'https://arbiscan.io/tx';
    case 'ethereum': return 'https://etherscan.io/tx';
    default: return 'https://etherscan.io/tx';
  }
}
