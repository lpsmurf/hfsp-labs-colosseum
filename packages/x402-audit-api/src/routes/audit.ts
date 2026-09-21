import { Router }            from 'express';
import rateLimit             from 'express-rate-limit';
import { verifyPayment }     from '../verify.js';
import { fetchRepo, parseRepoUrl } from '../github.js';
import { runStaticAnalysis } from '../static/index.js';
import { runExternalEngines } from '../engines/external.js';
import { runDynamicProbes }  from '../dynamic/index.js';
import { buildReport }       from '../report.js';
import { generateAIFeedback } from '../ai-feedback.js';
import { BASE_USDC, SOLANA_USDC_MINT, AUDIT_PRICE_USDC, config } from '../config.js';

export const auditRouter = Router();

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — try again in 10 minutes' },
});

// GET /audit?repo=https://github.com/owner/repo
// Returns 402 with payment details
auditRouter.get('/', (req, res) => {
  const repo = typeof req.query.repo === 'string' ? req.query.repo.trim() : null;

  if (!repo) {
    res.status(400).json({
      error: 'Missing ?repo= parameter',
      example: `GET /audit?repo=https://github.com/owner/repo`,
    });
    return;
  }

  try {
    parseRepoUrl(repo); // validate format
  } catch {
    res.status(400).json({ error: 'Invalid GitHub repo URL' });
    return;
  }

  const amountMicro = Math.round(AUDIT_PRICE_USDC * 1_000_000).toString();
  const resource    = `${req.protocol}://${req.get('host')}/audit`;

  res.status(402).json({
    x402Version: 1,
    error:       'Payment required to run security audit',
    description: `x402 security audit for ${repo}`,
    audit: {
      repo,
      includes: [
        'Secret scanning — 25+ provider rules (AWS/GCP/GitHub/Stripe/OpenAI/wallet keys) + Shannon-entropy detection, gitleaks-compatible',
        'SAST — OWASP Top 10 / CWE heuristics: SQLi, command injection, SSRF, weak crypto, eval, path traversal, JWT handling, TLS bypass',
        'x402 deep checks — webhook parse-before-verify, replay/idempotency, amount & network/asset validation, version pinning',
        'Static analysis — CORS misconfiguration, payment bypass patterns',
        'External engines — gitleaks + semgrep auto-run when available on the host',
        'Dynamic probing — live auth bypass test, CORS probe, info-leak probe',
      ],
      turnaround: '~30 seconds',
    },
    costBreakdown: {
      priceUsdc:  AUDIT_PRICE_USDC,
      serviceFee: '100% — no third-party fees',
      note:       'One audit per payment. Payment verified on Base before analysis runs.',
    },
    accepts: [
      {
        scheme:            'exact',
        network:           'base-mainnet',
        maxAmountRequired: amountMicro,
        asset:             BASE_USDC,
        payTo:             config.PAYMENT_RECIPIENT_BASE,
        resource,
        description:       `x402 security audit: ${repo} (Base USDC)`,
        mimeType:          'application/json',
        maxTimeoutSeconds: 300,
      },
      {
        scheme:            'exact',
        network:           'solana-mainnet',
        maxAmountRequired: amountMicro,
        asset:             SOLANA_USDC_MINT,
        payTo:             config.PAYMENT_RECIPIENT_SOL,
        resource,
        description:       `x402 security audit: ${repo} (Solana USDC)`,
        mimeType:          'application/json',
        maxTimeoutSeconds: 300,
      },
    ],
    howToPay: [
      `Option A (Base):    Send ${AUDIT_PRICE_USDC} USDC on Base to ${config.PAYMENT_RECIPIENT_BASE}`,
      `Option B (Solana):  Send ${AUDIT_PRICE_USDC} USDC on Solana to ${config.PAYMENT_RECIPIENT_SOL}`,
      `Then POST /audit with X-Payment: <txHash or signature> and body { "repo": "${repo}" }`,
    ],
  });
});

// POST /audit
// Body: { repo: string, endpoint?: string }
// Header: X-Payment: <Base tx hash>
auditRouter.post('/', limiter, async (req, res) => {
  const txHash   = (req.headers['x-payment'] as string | undefined)?.trim();
  const repo     = typeof req.body?.repo     === 'string' ? req.body.repo.trim()     : null;
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : null;

  if (!txHash) {
    res.status(400).json({ error: 'Missing X-Payment header' });
    return;
  }
  if (!repo) {
    res.status(400).json({ error: 'Missing body.repo — provide a GitHub repo URL' });
    return;
  }

  try {
    parseRepoUrl(repo);
  } catch {
    res.status(400).json({ error: 'Invalid GitHub repo URL' });
    return;
  }

  if (endpoint) {
    try {
      const u = new URL(endpoint);
      if (u.protocol !== 'https:') throw new Error();
    } catch {
      res.status(400).json({ error: 'endpoint must be a valid HTTPS URL' });
      return;
    }
  }

  // Verify payment first
  const { ok, error } = await verifyPayment(txHash);
  if (!ok) {
    res.status(402).json({ error });
    return;
  }

  // Run the audit
  try {
    const repoMeta = await fetchRepo(repo);
    const liveUrl  = endpoint ?? repoMeta.liveEndpoint;

    const [staticFindings, externalFindings, dynamicFindings] = await Promise.all([
      runStaticAnalysis(repoMeta.files),
      runExternalEngines(repoMeta.files),           // gitleaks + semgrep if installed; [] otherwise
      liveUrl ? runDynamicProbes(liveUrl) : Promise.resolve([]),
    ]);

    const report = buildReport(
      repo,
      repoMeta.commitSha,
      liveUrl,
      repoMeta.files.length,
      !!liveUrl,
      [...staticFindings, ...externalFindings, ...dynamicFindings],
    );

    // AI feedback via ACE Data Cloud (OpenAI gpt-4o-mini, paid via x402)
    const aiFeedback = await generateAIFeedback(
      report,
      config.ACEDATA_API_KEY ?? '',
      config.ACEDATA_FACILITATOR_ADDRESS ?? '',
    );

    console.log(`[audit] ${repo} → ${report.summary.verdict} (${report.summary.total} findings, AI: ${aiFeedback ? 'yes' : 'no'})`);

    res.status(200).json({ ...report, aiFeedback });
  } catch (err) {
    console.error('[audit] error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Audit failed — repo may be private or unreachable' });
  }
});
