import './config.js';
import express           from 'express';
import helmet            from 'helmet';
import { auditRouter }   from './routes/audit.js';
import { config, AUDIT_PRICE_USDC, BASE_USDC } from './config.js';

const app = express();

app.use(helmet());
app.use(express.json({ limit: '32kb' }));
app.set('trust proxy', 1);

app.use('/audit', auditRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'x402-audit-api' }));

app.get('/', (_req, res) => {
  res.json({
    service:     'x402-audit-api',
    version:     '0.1.0',
    description: 'Pay $0.99 USDC to get a static + dynamic security audit of any public x402 GitHub repo',
    price:       `${AUDIT_PRICE_USDC} USDC on Base`,
    asset:       BASE_USDC,
    payTo:       config.PAYMENT_RECIPIENT,
    checks: {
      static: [
        'CORS reflected-origin + credentials misconfiguration',
        'Payment header presence-only bypass pattern',
        'Hardcoded secrets (private keys, API keys)',
      ],
      dynamic: [
        'Live auth bypass — fake X-PAYMENT header accepted?',
        'Live CORS probe — reflected origin + credentials?',
        'Info leak — stack traces in error responses?',
      ],
    },
    usage: {
      step1: 'GET /audit?repo=https://github.com/owner/repo  →  receive 402 with payTo address',
      step2: 'Send 0.99 USDC on Base to payTo address',
      step3: 'POST /audit  body: { "repo": "...", "endpoint": "https://..." (optional) }  header: X-Payment: <txHash>',
      step4: 'Receive full audit report with findings, severity ratings, and fix guidance',
    },
  });
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server]', err instanceof Error ? err.message : err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = parseInt(config.PORT);
app.listen(PORT, () => {
  console.log(`[x402-audit-api] listening on :${PORT}`);
  console.log(`[x402-audit-api] price: $${AUDIT_PRICE_USDC} USDC → ${config.PAYMENT_RECIPIENT}`);
});
