/**
 * x402-audit-api LITE — agentic.market edition
 *
 * Identical to the full version but:
 * - No ACE Data Cloud / AI feedback (no external dependencies beyond Base RPC)
 * - Serves /.well-known/agent-card.json for agentic.market discovery
 * - Price: $0.99 USDC on Base
 */
import './config.js';
import express         from 'express';
import helmet          from 'helmet';
import { auditRouter } from './routes/audit-lite.js';
import { config, AUDIT_PRICE_USDC, BASE_USDC } from './config.js';

const app = express();
app.use(helmet());
app.use(express.json({ limit: '32kb' }));
app.set('trust proxy', 1);

app.use('/audit', auditRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'x402-audit-api-lite' }));

// agentic.market discovery — agent-card.json
app.get('/.well-known/agent-card.json', (_req, res) => {
  res.json({
    name:        'x402 Security Auditor',
    description: 'Pay $0.99 USDC to get a static + dynamic security audit of any public x402 GitHub repo. Checks CORS misconfig, payment bypass patterns, exposed secrets, and live auth bypass.',
    version:     '0.1.0',
    author:      'HFSP Labs',
    contact:     'info@hfsp.xyz',
    category:    'security',
    tags:        ['security', 'audit', 'x402', 'web3', 'defi'],
    networks:    ['base'],
    endpoints: [
      {
        url:         '/audit',
        method:      'GET',
        description: 'Get 402 payment request for a repo audit',
        params:      { repo: 'GitHub repo URL (e.g. https://github.com/owner/repo)' },
        pricing: { amount: AUDIT_PRICE_USDC.toString(), currency: 'USDC', network: 'base' },
      },
      {
        url:         '/audit',
        method:      'POST',
        description: 'Submit payment and run audit — returns full report',
        headers:     { 'X-Payment': 'Base USDC tx hash' },
        body:        { repo: 'string', endpoint: 'string (optional — live URL to probe)' },
        pricing: { amount: AUDIT_PRICE_USDC.toString(), currency: 'USDC', network: 'base' },
      },
    ],
    payment: {
      scheme:  'exact',
      network: 'eip155:8453',
      asset:   BASE_USDC,
      payTo:   config.PAYMENT_RECIPIENT,
    },
    extensions: {
      bazaar: {
        discoverable: true,
        category:     'security',
        tags:         ['x402', 'audit', 'security', 'github'],
      },
    },
  });
});

app.get('/', (_req, res) => {
  res.json({
    service:     'x402-audit-api',
    version:     '0.1.0',
    edition:     'lite',
    description: 'Pay $0.99 USDC to get a static + dynamic security audit of any public x402 GitHub repo',
    price:       `${AUDIT_PRICE_USDC} USDC on Base`,
    asset:       BASE_USDC,
    payTo:       config.PAYMENT_RECIPIENT,
    checks: {
      static:  ['CORS misconfiguration', 'Payment bypass patterns', 'Hardcoded secrets'],
      dynamic: ['Live auth bypass probe', 'CORS credentials probe', 'Info-leak probe'],
    },
    agentCard:  '/.well-known/agent-card.json',
    usage: {
      step1: 'GET /audit?repo=https://github.com/owner/repo  →  receive 402 with payTo address',
      step2: `Send ${AUDIT_PRICE_USDC} USDC on Base to payTo address`,
      step3: 'POST /audit  body: { "repo": "..." }  header: X-Payment: <txHash>',
      step4: 'Receive full audit report',
    },
    extensions: { bazaar: { discoverable: true, category: 'security' } },
  });
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server]', err instanceof Error ? err.message : err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = parseInt(process.env.PORT ?? '3009');
app.listen(PORT, () => {
  console.log(`[x402-audit-api lite] listening on :${PORT}`);
  console.log(`[x402-audit-api lite] price: $${AUDIT_PRICE_USDC} USDC → ${config.PAYMENT_RECIPIENT}`);
  console.log(`[x402-audit-api lite] agent-card: http://localhost:${PORT}/.well-known/agent-card.json`);
});
