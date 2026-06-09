import './config.js'; // validates env on startup
import express from 'express';
import helmet from 'helmet';
import { healthRouter }    from './routes/health.js';
import { charitiesRouter } from './routes/charities.js';
import { donateRouter }    from './routes/donate.js';
import { config } from './config.js';

const app = express();

app.use(helmet());
app.use(express.json({ limit: '32kb' }));
app.set('trust proxy', 1);

app.use('/health',    healthRouter);
app.use('/charities', charitiesRouter);
app.use('/donate',    donateRouter);

// Discovery doc — describes the x402 donation service
app.get('/', (_req, res) => {
  res.json({
    service:     'x402-donate',
    version:     '0.1.0',
    description: 'Send USDC directly to 10,000+ verified nonprofits on Base via Endaoment',
    catalog:     'https://endaoment.org — 10,000+ verified nonprofits, auto-synced every 4 hours',
    network:     'Base (chainId 8453)',
    asset:       'USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)',
    fees: {
      endaomentAdmin: '1.5% — deducted by Endaoment from the routed amount',
      thisService:    '3% — enforced on-chain by DonationRouter, sent to treasury',
      gasOnBase:      '~$0.001 (donor tx) — we cover the route() gas',
    },
    endpoints: {
      'GET  /charities':                 'List charities — ?search=name&category=X&limit=20&offset=0',
      'GET  /charities/:id':             'Get one charity by slug, EIN, or Endaoment UUID',
      'GET  /donate/:id?amount=5.00':    'Get 402 Payment Required — returns payTo address + cost breakdown',
      'POST /donate/:id':                'Submit donation — X-Payment: <Base USDC tx hash>',
    },
    example: {
      step1: 'GET /charities?search=red+cross — find a charity, note its slug',
      step2: 'GET /donate/american-red-cross?amount=10 — get the 402 with payTo address',
      step3: 'Send 10 USDC on Base to the payTo address from your wallet',
      step4: 'POST /donate/american-red-cross with X-Payment: <txHash> — get receipt',
    },
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] unhandled error:', err instanceof Error ? err.message : String(err));
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = parseInt(config.PORT);
app.listen(PORT, () => {
  console.log(`[x402-donate] listening on :${PORT}`);
  console.log(`[x402-donate] catalog: Endaoment (10,000+ nonprofits, Base USDC)`);
});
