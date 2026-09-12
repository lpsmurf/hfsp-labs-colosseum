import { Router }            from 'express';
import rateLimit             from 'express-rate-limit';
import { verifyPayment }     from '../verify.js';
import { fetchRepo, parseRepoUrl, GitHubError } from '../github.js';
import { analyzeStatic }     from '../static/index.js';
import { runSupplyChainAnalysis } from '../supply/index.js';
import {
  TIERS, DEFAULT_TIER, parseTier, engineSet, tierCatalog, redactForPreview,
} from '../tiers.js';
import type { Tier } from '../tiers.js';
import { runDynamicProbes }  from '../dynamic/index.js';
import { buildReport }       from '../report.js';
import { generateAIFeedback } from '../ai-feedback.js';
import { AUDIT_PRICE_USDC, config } from '../config.js';
import { NETWORKS, USDC as USDC_ASSET, usdc, encode, HEADER, attachReceipt , EIP712_DOMAIN} from '@hfsp/x402-common';
import { usesLegacyPayment } from '../x402.js';

export const auditRouter = Router();

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — try again in 10 minutes' },
});

// T0 is free and does real work, so it needs a tighter limit than the paid path
// — payment is what rate-limits everything else.
const previewLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Preview limit reached — try again in 10 minutes, or use the paid scan' },
});

// Distinguish "we ran out of GitHub budget" from "your repo is private". These
// need different actions from the caller and used to report identically.
function auditErrorStatus(err: unknown): number {
  if (err instanceof GitHubError) {
    if (err.kind === 'rate-limit') return 503;
    if (err.kind === 'not-found')  return 404;
  }
  return 500;
}

function auditErrorBody(err: unknown, what: string) {
  if (err instanceof GitHubError) {
    if (err.kind === 'rate-limit') {
      return {
        error:    `${what} unavailable — upstream rate limit`,
        detail:   err.message,
        retryable: true,
      };
    }
    if (err.kind === 'not-found') {
      return {
        error:  `${what} failed — repository not found`,
        detail: 'The repository does not exist, or it is private and this service has no access to it.',
        retryable: false,
      };
    }
  }
  return { error: `${what} failed — repo may be private or unreachable`, retryable: false };
}

// Shared by the preview and paid paths.
async function runAudit(repo: string, endpoint: string | null, tier: Tier) {
  const engines  = engineSet(tier);
  const repoMeta = await fetchRepo(repo);
  const liveUrl  = engines.has('dynamic') ? (endpoint ?? repoMeta.liveEndpoint) : null;

  const [staticResult, dynamicFindings] = await Promise.all([
    analyzeStatic(repoMeta.files, engines),
    liveUrl ? runDynamicProbes(liveUrl) : Promise.resolve([]),
  ]);

  // Needs the static pass first: patch-age is only scored on files the static
  // rules already called security-critical.
  const supply = await runSupplyChainAnalysis(
    repoMeta.owner,
    repoMeta.repo,
    repoMeta.files,
    staticResult.criticalPaths,
    engines,
  );

  const report = buildReport(
    repo,
    repoMeta.commitSha,
    liveUrl,
    repoMeta.files.length,
    !!liveUrl,
    [...staticResult.findings, ...dynamicFindings, ...supply.findings],
    staticResult.coverage,
  );

  return { report, engines };
}

// GET /audit/tiers — what can be bought, and what is not buyable yet.
auditRouter.get('/tiers', (_req, res) => {
  res.status(200).json({
    tiers: tierCatalog(),
    note:  'Tiers differ by the depth of analysis performed, not by which findings are disclosed. A finding a tier surfaces is always returned at that tier.',
    docs:  'x402-audit/references/service-tiers.md',
  });
});

// GET /audit/preview?repo=... — T0. Free, no payment, counts only.
auditRouter.get('/preview', previewLimiter, async (req, res) => {
  const repo = typeof req.query.repo === 'string' ? req.query.repo.trim() : null;
  if (!repo) {
    res.status(400).json({ error: 'Missing ?repo= parameter' });
    return;
  }
  try {
    parseRepoUrl(repo);
  } catch {
    res.status(400).json({ error: 'Invalid GitHub repo URL' });
    return;
  }

  try {
    const { report } = await runAudit(repo, null, TIERS.T0);
    console.log(`[preview] ${repo} → ${report.summary.verdict} (${report.summary.total} findings, redacted)`);
    res.status(200).json(redactForPreview(report));
  } catch (err) {
    console.error('[preview] error:', err instanceof Error ? err.message : err);
    res.status(auditErrorStatus(err)).json(auditErrorBody(err, 'Preview'));
  }
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

  // ?tier= selects depth. Unknown values are rejected rather than silently
  // downgraded, so a caller never pays for less than they asked for.
  const tierId = req.query.tier === undefined ? DEFAULT_TIER : parseTier(req.query.tier);
  if (!tierId) {
    res.status(400).json({
      error: `Unknown tier "${String(req.query.tier)}"`,
      tiers: tierCatalog().map(t => t.tier),
    });
    return;
  }
  const tier = TIERS[tierId];

  if (tierId === 'T0') {
    res.status(400).json({
      error: 'T0 is free and lives at a different path',
      use:   `GET /audit/preview?repo=${encodeURIComponent(repo)}`,
    });
    return;
  }

  // Not-yet-available tiers say what is missing instead of quoting a price we
  // cannot honour. 501, not 402 — taking payment for this would be fraud.
  if (!tier.available || tier.priceUsdc === null) {
    res.status(501).json({
      error:      `Tier ${tier.id} (${tier.name}) is not self-serve yet`,
      tier:       tier.id,
      summary:    tier.summary,
      blockedOn:  tier.blockedOn,
      turnaround: tier.turnaround,
      available:  tierCatalog().filter(t => t.available).map(t => t.tier),
      contact:    'info@hfsp.xyz',
    });
    return;
  }

  const price    = tier.priceUsdc;
  const resource = `${req.protocol}://${req.get('host')}/audit`;

  // Spec-shaped V2 challenge, one `accepts` entry per network. The base64 form
  // goes in the PAYMENT-REQUIRED header for standard clients; the JSON body
  // carries the same thing plus the human-readable extras.
  const challenge = {
    x402Version: 2 as const,
    resource: {
      url:         resource,
      description: `x402 security audit (${tier.id} ${tier.name}) for ${repo}`,
      mimeType:    'application/json',
    },
    accepts: [
      {
        scheme:            'exact',
        network:           NETWORKS.base,
        amount:            usdc(price),
        asset:             USDC_ASSET.base,
        payTo:             config.PAYMENT_RECIPIENT_BASE,
        maxTimeoutSeconds: 300,
        // EVM settles via EIP-3009; the client cannot sign without the token's
        // EIP-712 domain. Solana (SPL) needs no equivalent.
        extra:             EIP712_DOMAIN.base,
      },
      {
        scheme:            'exact',
        network:           NETWORKS.solana,
        amount:            usdc(price),
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
         tier:     tier.id,
         tierName: tier.name,
         includes: [
           'Static analysis (JS/TS) — CORS misconfiguration, payment bypass patterns, exposed secrets',
           'Static analysis (Solidity) — reentrancy ordering, unchecked calls and ERC-20 returns, tx.origin auth, signature replay, spot-price oracles, unprotected initializers; findings cite SWC/CWE',
           'Static analysis (Solana/Anchor) — missing signer and owner checks, unconstrained accounts, PDA bump canonicalization, arbitrary CPI, account revival, overflow-checks',
           'Verification-cache correctness (Solidity/Rust/C++) — cache-hit short-circuits and keys that do not bind the verified object',
           'Dynamic probing — live auth bypass test, CORS probe, info-leak probe',
           'Every finding carries a confidence level; Clarity and Move files are counted but not yet analysed',
         ],
         turnaround: tier.turnaround,
         notIncluded: [
           'Cross-file and inheritance-aware analysis (Aderyn/Slither/Semgrep) — T2',
           'Lockfile-exact transitive dependency advisories — T2',
           'Differential cache testing, fuzzing and symbolic execution — T3',
           'Human review and a signed report — T4',
         ],
       },
       costBreakdown: {
         priceUsdc:  price,
         serviceFee: '100% — no third-party fees',
         note:       'One audit per payment. Payment verified on-chain before analysis runs.',
       },
       upgrade: tierCatalog().filter(t => t.tier > tier.id),
       howToPay: [
         `Preferred: POST /audit with a PAYMENT-SIGNATURE header (any x402 V2 client, e.g. @x402/fetch)`,
         `Legacy (Base):   send ${price} USDC on Base to ${config.PAYMENT_RECIPIENT_BASE}`,
         `Legacy (Solana): send ${price} USDC on Solana to ${config.PAYMENT_RECIPIENT_SOL}`,
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

  // The tier must match what was paid for. Default keeps older clients working.
  const tierId = req.body?.tier === undefined ? DEFAULT_TIER : parseTier(req.body.tier);
  if (!tierId || tierId === 'T0') {
    res.status(400).json({
      error: `Invalid tier for a paid audit: "${String(req.body?.tier)}"`,
      tiers: tierCatalog().filter(t => t.available && t.priceUsdc !== null).map(t => t.tier),
    });
    return;
  }
  const tier = TIERS[tierId];
  if (!tier.available) {
    res.status(501).json({
      error:     `Tier ${tier.id} is not self-serve yet`,
      blockedOn: tier.blockedOn,
      contact:   'info@hfsp.xyz',
    });
    return;
  }

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
    const { report, engines } = await runAudit(repo, endpoint, tier);

    // AI feedback via ACE Data Cloud (OpenAI gpt-4o-mini, paid via x402)
    const aiFeedback = engines.has('ai-summary')
      ? await generateAIFeedback(
          report,
          config.ACEDATA_API_KEY ?? '',
          config.ACEDATA_FACILITATOR_ADDRESS ?? '',
        )
      : null;

    console.log(`[audit] ${tier.id} ${repo} → ${report.summary.verdict} (${report.summary.total} findings, AI: ${aiFeedback ? 'yes' : 'no'})`);

    res.status(200).json({
      ...report,
      tier: tier.id,
      aiFeedback,
      // Honest statement of what this tier did not look at, so a clean report
      // is never mistaken for a complete one.
      notAnalysed: {
        crossFile:    'Rules are file-local: no inheritance graph, no call graph, no type resolution. T2 adds this.',
        languages:    Object.keys(report.meta.coverage ?? {}).filter(l => l === 'clarity' || l === 'move'),
        unprovenLeads: report.summary.needsReview,
      },
    });
  } catch (err) {
    console.error('[audit] error:', err instanceof Error ? err.message : err);
    res.status(auditErrorStatus(err)).json(auditErrorBody(err, 'Audit'));
  }
});
