/**
 * Labeled triage cases. Live cases come from hand-verified results in
 * findings/security-sweep-p1-p2.md, findings/security-sweep-p4.md and
 * findings/CRITICAL-base-intel-api-auth-bypass.md. Synthetic cases cover
 * secret / stack-trace shapes we have no live example of; their secrets are
 * generated at runtime so no key-shaped literal is ever committed.
 */

import { randomBytes } from 'crypto';
import type { Check, FindingClass, HttpSample } from '../lib/typesafe-triage';

export interface Case {
  id: string;
  check: Check;
  /** Ground truth: is this a real, reportable finding? */
  real: boolean;
  expectedClass?: FindingClass;
  source: string;
  live?: { url: string; method: string; matchRe?: RegExp };
  /** Used when there is no live target, or the live target no longer reproduces. */
  synthetic?: { url: string; method: string; baseline: HttpSample; probe: HttpSample; match?: string };
}

const JSON_CT = 'application/json';
const b62 = (n: number) => randomBytes(n * 2).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, n);
const x402Body = JSON.stringify({
  x402Version: 1, error: 'X-PAYMENT header is required',
  accepts: [{ scheme: 'exact', network: 'base', maxAmountRequired: '10000', payTo: '0x' + 'ab'.repeat(20), asset: 'USDC' }],
});
const gated: HttpSample = { status: 402, contentType: JSON_CT, body: x402Body };

const stripeSecret = 'sk_' + 'live_' + b62(24);
const openaiKey = 'sk-' + b62(40);
const keypair = '[' + Array.from(randomBytes(64)).join(',') + ']';
const awsDocsKey = 'AKIA' + 'IOSFODNN7EXAMPLE';

export const CASES: Case[] = [
  // ── fake X-PAYMENT accepted ────────────────────────────────────────────────
  {
    id: 'base-intel-api', check: 'fake_payment', real: true, expectedClass: 'real_bypass',
    source: 'findings/CRITICAL-base-intel-api-auth-bypass.md',
    live: { url: 'https://base-intel-api.jakemaxsigal.workers.dev/bankr/score', method: 'GET' },
    synthetic: {
      url: 'https://base-intel-api.jakemaxsigal.workers.dev/bankr/score', method: 'GET', baseline: gated,
      probe: { status: 200, contentType: JSON_CT, body: JSON.stringify({
        timestamp: '2026-06-05T10:12:00Z', count: 10,
        launches: [
          { tokenName: 'CozeStudio', tokenSymbol: 'COZES', tokenAddress: '0x845cc' + 'e1'.repeat(17), score: 82, holders: 412, liquidityUsd: 51230 },
          { tokenName: 'Flux', tokenSymbol: 'FLX', tokenAddress: '0x19ad0' + '7c'.repeat(17), score: 64, holders: 98, liquidityUsd: 8120 },
        ],
      }) },
    },
  },
  {
    id: 'flipr-x402', check: 'fake_payment', real: false, expectedClass: 'error_envelope',
    source: 'findings/security-sweep-p1-p2.md (200 body is an error envelope)',
    live: { url: 'https://flipr-x402.fly.dev/x402/flip', method: 'POST' },
  },
  {
    id: 'x402joke', check: 'fake_payment', real: false, expectedClass: 'error_envelope',
    source: 'STATUS.md verified false positives (200-on-error envelope)',
    live: { url: 'https://x402joke.vercel.app/api/buy', method: 'GET' },
  },
  {
    id: 'theloopbreaker', check: 'fake_payment', real: false, expectedClass: 'error_envelope',
    source: 'STATUS.md verified false positives (200-on-error envelope)',
    live: { url: 'https://theloopbreaker.com/api/x402/actions/accept-bid', method: 'GET' },
  },
  {
    id: 'myceliasignal-sho-info', check: 'fake_payment', real: false, expectedClass: 'discovery_doc',
    source: 'STATUS.md verified false positives (public manifest)',
    live: { url: 'https://api.myceliasignal.com/sho/info', method: 'GET' },
  },
  {
    id: 'fiasignals', check: 'fake_payment', real: false, expectedClass: 'free_route',
    source: 'findings/security-sweep-p4.md (baseline already 200)',
    live: { url: 'https://x402.fiasignals.com/acp-direct/token-safety-check', method: 'POST' },
  },
  {
    id: 'wiselyenterprises', check: 'fake_payment', real: false, expectedClass: 'free_route',
    source: 'findings/security-sweep-p4.md (baseline already 200)',
    live: { url: 'https://payments.wiselyenterprisesllc.com/tools/payout-test-20260522075204-7f68', method: 'POST' },
  },
  {
    id: 'fpds-mcp', check: 'fake_payment', real: false, expectedClass: 'free_route',
    source: 'findings/security-sweep-p4.md (baseline already 200)',
    live: { url: 'https://fpds-mcp.mtree.workers.dev/v1/contracts/search', method: 'GET' },
  },

  // ── method confusion (GET 200 while POST is gated) ─────────────────────────
  ...([
    ['molty-a2a', 'https://api.molty.cash/0xmesuthere/a2a'],
    ['x402-deployer', 'https://x402-deployer.x402-deployer.workers.dev/13f-deltas'],
    ['wallet-portfolio-history', 'https://wallet-portfolio-history-mcp.mtree.workers.dev/tools/account_identity'],
    ['wallet-portfolio-risk', 'https://wallet-portfolio-risk-mcp.mtree.workers.dev/v1/wallet/liquidation_alert_threshold'],
  ] as const).map(([id, url]): Case => ({
    id, check: 'alt_method', real: false, expectedClass: 'discovery_doc',
    source: 'findings/security-sweep-p1-p2.md + p4 (GET serves manifest / agent card)',
    live: { url, method: 'POST' },
  })),
  {
    id: 'synthetic-get-leaks-data', check: 'alt_method', real: true, expectedClass: 'real_bypass',
    source: 'synthetic: GET returns the same paid dataset POST charges for',
    synthetic: {
      url: 'https://example-x402.dev/api/wallet-risk', method: 'POST', baseline: gated,
      probe: { status: 200, contentType: JSON_CT, body: JSON.stringify({
        wallet: '0x' + '3f'.repeat(20), riskScore: 71, flags: ['mixer_exposure', 'new_wallet'],
        counterparties: [{ address: '0x' + '9a'.repeat(20), volumeUsd: 120400, label: 'Tornado Router' }],
        computedAt: '2026-06-06T08:00:00Z',
      }) },
    },
  },

  // ── secrets ────────────────────────────────────────────────────────────────
  {
    id: 'anchor-x402-content-hash', check: 'secret', real: false,
    source: 'findings/security-sweep-p1-p2.md (64-hex was a public content hash)',
    live: { url: 'https://api.anchor-x402.com/v1/anchor', method: 'POST', matchRe: /\b[0-9a-fA-F]{64}\b/ },
  },
  {
    id: 'voidfeed-pk-live', check: 'secret', real: false,
    source: 'STATUS.md (Stripe publishable key — public by design)',
    live: { url: 'https://voidfeed.ai/v1/content/capability/latest', method: 'GET', matchRe: /pk_live_[A-Za-z0-9]{16,}/ },
  },
  {
    id: 'synthetic-stripe-secret', check: 'secret', real: true,
    source: 'synthetic: secret key echoed in a debug error body',
    synthetic: {
      url: 'https://example-x402.dev/api/checkout', method: 'POST', baseline: gated, match: stripeSecret,
      probe: { status: 500, contentType: JSON_CT, body: JSON.stringify({
        error: 'StripeAuthenticationError', debug: { config: { stripeSecretKey: stripeSecret, mode: 'live' } },
      }) },
    },
  },
  {
    id: 'synthetic-openai-key', check: 'secret', real: true,
    source: 'synthetic: upstream LLM key leaked in error',
    synthetic: {
      url: 'https://example-x402.dev/api/summarize', method: 'POST', baseline: gated, match: openaiKey,
      probe: { status: 502, contentType: JSON_CT, body: JSON.stringify({
        error: 'upstream failed', request: { headers: { Authorization: `Bearer ${openaiKey}` }, url: 'https://api.openai.com/v1/chat/completions' },
      }) },
    },
  },
  {
    id: 'synthetic-solana-keypair', check: 'secret', real: true,
    source: 'synthetic: Solana keypair array dumped in env debug output',
    synthetic: {
      url: 'https://example-x402.dev/api/mint', method: 'POST', baseline: gated, match: keypair,
      probe: { status: 500, contentType: JSON_CT, body: `{"error":"signer failed","env":{"PAYER_KEYPAIR":${keypair}}}` },
    },
  },
  {
    id: 'synthetic-aws-docs-example', check: 'secret', real: false,
    source: 'synthetic: AWS documentation placeholder key in help text',
    synthetic: {
      url: 'https://example-x402.dev/api/upload', method: 'POST', baseline: gated, match: awsDocsKey,
      probe: { status: 400, contentType: JSON_CT, body: JSON.stringify({
        error: 'Bad request', help: `Pass your own credentials, e.g. {"accessKeyId":"${awsDocsKey}","region":"us-east-1"} — see README`,
      }) },
    },
  },

  // ── stack traces ───────────────────────────────────────────────────────────
  {
    id: 'homepulse', check: 'stack_trace', real: false,
    source: 'findings/security-sweep-p4.md (/home/ matched the service name)',
    live: { url: 'https://homepulse-seven.vercel.app/api/home/maintain', method: 'GET', matchRe: /\/home\// },
  },
  {
    id: 'synthetic-node-trace', check: 'stack_trace', real: true,
    source: 'synthetic: Express 500 with V8 stack on malformed X-PAYMENT',
    synthetic: {
      url: 'https://example-x402.dev/api/data', method: 'POST', baseline: gated,
      probe: { status: 500, contentType: 'text/html', body:
        'SyntaxError: Unexpected token j in JSON at position 0\n    at JSON.parse (<anonymous>)\n' +
        '    at decodePayment (/var/task/src/x402/verify.js:41:23)\n    at /var/task/src/server.js:88:19\n' +
        '    at Layer.handle [as handle_request] (/var/task/node_modules/express/lib/router/layer.js:95:5)' },
    },
  },
];
