import './config.js';
import path              from 'path';
import { fileURLToPath } from 'url';
import express           from 'express';
import helmet            from 'helmet';
import { auditRouter }   from './routes/audit.js';
import { x402Gate, enabledNetworks } from './x402.js';
import { config, AUDIT_PRICE_USDC } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(helmet());
app.use(express.json({ limit: '32kb' }));
app.set('trust proxy', 1);

// x402 V2 gate runs before the router: a PAYMENT-SIGNATURE request is verified
// and settled here, so auditRouter only ever sees paid traffic on that path.
app.use(x402Gate);
app.use('/audit', auditRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'x402-audit-api' }));

app.get('/info', (_req, res) => {
  res.json({
    service:     'x402-audit-api',
    version:     '0.1.0',
    description: 'Pay $0.99 USDC to get a static + dynamic security audit of any public x402 GitHub repo',
    price:       `${AUDIT_PRICE_USDC} USDC`,
    networks:    enabledNetworks,
    payTo: {
      base:   config.PAYMENT_RECIPIENT_BASE,
      solana: config.PAYMENT_RECIPIENT_SOL,
      ...(enabledNetworks.some(n => n.startsWith('celo')) ? { celo: config.PAYMENT_RECIPIENT_CELO } : {}),
    },
  });
});

// Landing page — serve HTML for browsers, JSON for API clients
app.get('/', (req, res) => {
  const acceptsHtml = req.headers.accept?.includes('text/html');
  if (acceptsHtml) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  } else {
    res.json({ service: 'x402-audit-api', version: '0.1.0', info: '/info', audit: '/audit' });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server]', err instanceof Error ? err.message : err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = parseInt(config.PORT);
app.listen(PORT, () => {
  console.log(`[x402-audit-api] listening on :${PORT}`);
  console.log(`[x402-audit-api] price: $${AUDIT_PRICE_USDC} USDC | Base → ${config.PAYMENT_RECIPIENT_BASE} | Solana → ${config.PAYMENT_RECIPIENT_SOL}` +
    (enabledNetworks.some(n => n.startsWith('celo')) ? ` | Celo → ${config.PAYMENT_RECIPIENT_CELO}` : ' | Celo off'));
});
