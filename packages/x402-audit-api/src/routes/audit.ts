import { Router }            from 'express';
import rateLimit             from 'express-rate-limit';
import { verifyPayment }     from '../verify.js';
import { fetchRepo, parseRepoUrl } from '../github.js';
import { runStaticAnalysis } from '../static/index.js';
import { runDynamicProbes }  from '../dynamic/index.js';
import { buildReport }       from '../report.js';
import { generateAIFeedback } from '../ai-feedback.js';
import { AUDIT_PRICE_USDC, config } from '../config.js';
import { NETWORKS, USDC as USDC_ASSET, usdc, encode, HEADER, attachReceipt } from '@hfsp/x402-common';
import { usesLegacyPayment } from '../x402.js';

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

  const resource = `${req.protocol}://${req.get('host')}/audit`;

  // Spec-shaped V2 challenge, one `accepts` entry per network. The base64 form
  // goes in the PAYMENT-REQUIRED header for standard clients; the JSON body
  // carries the same thing plus the human-readable extras.
  const challenge = {
    x402Version: 2 as const,
    resource: {
      url:         resource,
      description: `x402 security audit for ${repo}`,
      mimeType:    'application/json',
    },
    accepts: [
      {
        scheme:            'exact',
        network:           NETWORKS.base,
        amount:            usdc(AUDIT_PRICE_USDC),
        asset:             USDC_ASSET.base,
        payTo:             config.PAYMENT_RECIPIENT_BASE,
        maxTimeoutSeconds: 300,
        extra:             {},
      },
      {
        scheme:            'exact',
        network:           NETWORKS.solana,
        amount:            usdc(AUDIT_PRICE_USDC),
        asset:             USDC_ASSET.solana,
        payTo:             config.PAYMENT_RECIPIENT_SOL,
        maxTimeoutSeconds: 300,
        extra:             {},
      },
    ],
  };

  res.set(HEADER.required, encode(challenge))
     .status(402)
     .json({
       ...challenge,
       error:       'Payment required to run security audit',
       audit: {
         repo,
         includes: [
           'Static analysis — CORS misconfiguration, payment bypass patterns, exposed secrets',
           'Dynamic probing — live auth bypass test, CORS probe, info-leak probe',
         ],
         turnaround: '~30 seconds',
       },
       costBreakdown: {
         priceUsdc:  AUDIT_PRICE_USDC,
         serviceFee: '100% — no third-party fees',
         note:       'One audit per payment. Payment verified on-chain before analysis runs.',
       },
       howToPay: [
         `Preferred: POST /audit with a PAYMENT-SIGNATURE header (any x402 V2 client, e.g. @x402/fetch)`,
         `Legacy (Base):   send ${AUDIT_PRICE_USDC} USDC on Base to ${config.PAYMENT_RECIPIENT_BASE}`,
         `Legacy (Solana): send ${AUDIT_PRICE_USDC} USDC on Solana to ${config.PAYMENT_RECIPIENT_SOL}`,
         `Then POST /audit with X-Payment: <txHash or signature> and body { "repo": "${repo}" }`,
       ],
     });
});

// POST /audit
// Body: { repo: string, endpoint?: string }
//
// Payment arrives one of two ways:
//   - PAYMENT-SIGNATURE — already verified and settled by the x402 middleware
//     before this handler runs, so there is nothing left to check here.
//   - X-Payment: <txHash|signature> — legacy flow, verified below.
auditRouter.post('/', limiter, async (req, res) => {
  const legacy   = usesLegacyPayment(req);
  const txHash   = (req.headers['x-payment'] as string | undefined)?.trim();
  const repo     = typeof req.body?.repo     === 'string' ? req.body.repo.trim()     : null;
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : null;

  if (legacy && !txHash) {
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

  // Legacy path only. A V2 payment was already verified and settled by the
  // facilitator in the middleware — reaching this handler at all means it passed.
  if (legacy) {
    const { ok, error, chain } = await verifyPayment(txHash!);
    if (!ok) {
      res.status(402).json({ error });
      return;
    }
    // Legacy clients never got a machine-readable receipt. Give them one so an
    // agent can record what it spent without parsing prose.
    attachReceipt(res, {
      success:     true,
      network:     chain === 'solana' ? 'solana' : 'base',
      transaction: txHash!,
    });
  }

  // Run the audit
  try {
    const repoMeta = await fetchRepo(repo);
    const liveUrl  = endpoint ?? repoMeta.liveEndpoint;

    const [staticFindings, dynamicFindings] = await Promise.all([
      runStaticAnalysis(repoMeta.files),
      liveUrl ? runDynamicProbes(liveUrl) : Promise.resolve([]),
    ]);

    const report = buildReport(
      repo,
      repoMeta.commitSha,
      liveUrl,
      repoMeta.files.length,
      !!liveUrl,
      [...staticFindings, ...dynamicFindings],
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
