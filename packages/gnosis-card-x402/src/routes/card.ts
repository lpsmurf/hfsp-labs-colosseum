/**
 * /api/card — Gnosis Pay card products
 *
 * ── Option 1: Safe Top-Up ────────────────────────────────────────────────────
 *   GET  /api/card/topup/quote      get bridge quote (amount, fees, ETA)
 *   POST /api/card/topup            [x402] pay USDC → bridge to Safe on Gnosis
 *   GET  /api/card/topup/:orderId   poll bridge status
 *
 * ── Option 2: Managed Onboarding ─────────────────────────────────────────────
 *   GET  /api/card/onboard/nonce    get SIWE nonce for wallet address
 *   POST /api/card/onboard/session  verify SIWE signature → create GP session
 *   POST /api/card/onboard          [x402] pay setup fee → activate onboarding
 *   GET  /api/card/onboard/:id      get onboarding status
 *   POST /api/card/onboard/:id/terms    accept GP Terms & Conditions
 *   POST /api/card/onboard/:id/card     create virtual card (after KYC + Safe)
 *   GET  /api/card/onboard/:id/kyc      get Sumsub token for KYC widget
 *   POST /api/card/onboard/sumsub-webhook  Sumsub KYC event callback
 */

import { Router } from 'express';
import { z } from 'zod';
import { makeX402Gate } from '../middleware/x402.js';
import { isSpent, markSpent } from '../services/nullifier.js';
import { getQuote, createAndSubmitOrder, getOrderStatus } from '../services/bridge.js';
import {
  getSiweNonce,
  verifyAndGetJwt,
  createSession,
  getSession,
  acceptTerms,
  getKycToken,
  onKycApproved,
  pollSafeDeployment,
  createVirtualCard,
} from '../services/gnosis-pay.js';
import { config, GNOSIS_TOKENS, type GnosisToken, type SourceChain } from '../config.js';

export const cardRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const topupQuerySchema = z.object({
  amount:      z.string().transform(Number).pipe(z.number().min(1).max(10_000)),
  safeAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid Gnosis Safe address'),
  currency:    z.enum(['USDCe', 'EURe', 'GBPe']).default('USDCe'),
  sourceChain: z.enum(['solana', 'base']).default('solana'),
});

const topupBodySchema = z.object({
  amount:      z.number().min(1).max(10_000),
  safeAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  currency:    z.enum(['USDCe', 'EURe', 'GBPe']).default('USDCe'),
  sourceChain: z.enum(['solana', 'base']).default('solana'),
});

const nonceQuerySchema = z.object({
  wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM wallet address'),
});

const sessionBodySchema = z.object({
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  siweMessage:   z.string().min(10),
  signature:     z.string().min(10),
});

// ─── OPTION 1: SAFE TOP-UP ────────────────────────────────────────────────────

/**
 * GET /api/card/topup/quote
 * Returns bridge fee breakdown + estimated arrival time.
 * No payment required — pure read.
 *
 * Query: amount (USDC), safeAddress (0x...), currency (USDCe|EURe|GBPe)
 */
cardRouter.get('/topup/quote', async (req, res) => {
  const parsed = topupQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid params', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { amount, safeAddress, currency, sourceChain } = parsed.data;

  try {
    const quote = await getQuote({ srcAmountUsdc: amount, dstToken: currency as GnosisToken, safeAddress, sourceChain: sourceChain as SourceChain });
    const isBase = sourceChain === 'base';
    res.json({
      ok: true,
      quote: {
        youPay:         `${amount} USDC (${isBase ? 'Base' : 'Solana'})`,
        youReceive:     `${quote.dstAmountFormatted.toFixed(4)} ${currency} (Gnosis Chain)`,
        bridgeFee:      `$${quote.bridgeFeeUsdc.toFixed(4)} USDC`,
        serviceFee:     `$${quote.ourFeeUsdc.toFixed(4)} USDC (${config.TOPUP_FEE_PCT}%)`,
        estimatedTime:  `~${Math.ceil(quote.estimatedFillTimeMs / 60_000)} min`,
        safeAddress,
        dstTokenAddress: quote.dstTokenAddress,
      },
      payment: isBase ? {
        payTo:   config.EVM_WALLET_ADDRESS,
        asset:   '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        network: 'base-mainnet',
        amount:  amount.toFixed(6),
      } : {
        payTo:   config.WALLET_PUBLIC_KEY,
        asset:   'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        network: 'solana-mainnet',
        amount:  amount.toFixed(6),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `Bridge quote unavailable: ${msg}` });
  }
});

/**
 * POST /api/card/topup
 * x402: user pays `amount` USDC to our Solana wallet.
 * We bridge an equivalent amount to their Gnosis Safe.
 *
 * Body: { amount, safeAddress, currency }
 * Header: X-Payment: <solana-tx-signature>
 */
cardRouter.post(
  '/topup',
  makeX402Gate({
    amountUsdc:  (req) => {
      const n = Number(req.body?.amount);
      return isNaN(n) || n < 1 ? 1 : n;
    },
    description: (req) =>
      `Gnosis Pay Safe top-up — ${req.body?.amount ?? '?'} USDC → ${req.body?.currency ?? 'USDCe'} on Gnosis Chain`,
    resource: '/api/card/topup',
  }),
  async (req, res) => {
    const parsed = topupBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten().fieldErrors });
      return;
    }
    const { amount, safeAddress, currency, sourceChain } = parsed.data;
    const { signature } = res.locals.payment as { paidUsdc: number; signature: string; chain: string };

    // Prevent replay
    if (await isSpent(signature)) {
      res.status(409).json({ error: 'Payment already used' });
      return;
    }

    try {
      await markSpent(signature);

      const order = await createAndSubmitOrder({
        srcAmountUsdc: amount,
        dstToken:      currency as GnosisToken,
        safeAddress,
        sourceChain:   sourceChain as SourceChain,
      });

      res.status(202).json({
        ok:             true,
        orderId:        order.orderId,
        status:         order.status,
        srcTxHash:      order.srcTxHash,
        safeAddress,
        currency,
        message:        'Bridge order submitted. Funds will arrive in your Safe in ~1-3 minutes.',
        poll:           `/api/card/topup/${encodeURIComponent(order.orderId)}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: `Bridge submission failed: ${msg}` });
    }
  },
);

/**
 * GET /api/card/topup/:orderId
 * Poll deBridge for bridge order status.
 */
cardRouter.get('/topup/:orderId', async (req, res) => {
  const { orderId } = req.params;
  if (!orderId) { res.status(400).json({ error: 'Missing orderId' }); return; }

  try {
    const status = await getOrderStatus(orderId);
    res.json({
      ok:        true,
      orderId:   status.orderId,
      status:    status.status,
      srcTxHash: status.srcTxHash,
      dstTxHash: status.dstTxHash,
      message:
        status.status === 'fulfilled' ? 'Funds arrived in your Safe.' :
        status.status === 'failed'    ? 'Bridge order failed. Contact support.' :
        'Bridge in progress — check back in ~30 seconds.',
    });
  } catch (err: unknown) {
    res.status(502).json({ error: `Status check failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

// ─── OPTION 2: MANAGED ONBOARDING ─────────────────────────────────────────────

/**
 * GET /api/card/onboard/nonce
 * Step 1 of SIWE: get nonce to include in the message the user signs.
 * Query: wallet=0x...
 */
cardRouter.get('/onboard/nonce', async (req, res) => {
  const parsed = nonceQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid wallet address' });
    return;
  }
  try {
    const nonce = await getSiweNonce(parsed.data.wallet);
    res.json({ ok: true, nonce });
  } catch (err: unknown) {
    res.status(502).json({ error: `Nonce fetch failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

/**
 * POST /api/card/onboard/session
 * Step 2 of SIWE: verify signature → create a GP JWT session.
 * Must call this BEFORE paying the x402 onboarding fee.
 *
 * Body: { walletAddress, siweMessage, signature }
 * Returns: { sessionId } — pass this into POST /api/card/onboard
 */
cardRouter.post('/onboard/session', async (req, res) => {
  const parsed = sessionBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { walletAddress, siweMessage, signature } = parsed.data;

  try {
    const jwt = await verifyAndGetJwt(siweMessage, signature);
    const session = await createSession(walletAddress, jwt);
    res.json({
      ok:        true,
      sessionId: session.id,
      status:    session.status,
      message:   'Session created. Pay the onboarding fee to activate.',
    });
  } catch (err: unknown) {
    res.status(401).json({ error: `SIWE verification failed: ${err instanceof Error ? err.message : String(err)}` });
  }
});

/**
 * POST /api/card/onboard
 * x402: pay setup fee → mark session as paid and ready for KYC.
 *
 * Body: { sessionId }
 * Header: X-Payment: <solana-tx-signature for ONBOARD_FEE_USDC>
 */
cardRouter.post(
  '/onboard',
  makeX402Gate({
    amountUsdc:  parseFloat(config.ONBOARD_FEE_USDC),
    description: `Gnosis Pay onboarding — managed Safe deployment + virtual card ($${config.ONBOARD_FEE_USDC} USDC)`,
    resource:    '/api/card/onboard',
  }),
  async (req, res) => {
    const sessionId = z.string().uuid().safeParse(req.body?.sessionId);
    if (!sessionId.success) {
      res.status(400).json({ error: 'sessionId must be a valid UUID from POST /api/card/onboard/session' });
      return;
    }

    const { signature } = res.locals.payment as { paidUsdc: number; signature: string };
    if (await isSpent(signature)) {
      res.status(409).json({ error: 'Payment already used' });
      return;
    }

    const session = await getSession(sessionId.data);
    if (!session) {
      res.status(404).json({ error: 'Session not found — call POST /api/card/onboard/session first' });
      return;
    }

    await markSpent(signature);

    res.json({
      ok:        true,
      sessionId: session.id,
      status:    session.status,
      nextSteps: [
        { step: 1, action: 'Accept terms',  endpoint: `POST /api/card/onboard/${session.id}/terms` },
        { step: 2, action: 'Complete KYC',  endpoint: `GET  /api/card/onboard/${session.id}/kyc` },
        { step: 3, action: 'Create card',   endpoint: `POST /api/card/onboard/${session.id}/card` },
      ],
      poll: `/api/card/onboard/${session.id}`,
    });
  },
);

/**
 * GET /api/card/onboard/:id
 * Full session status — use to drive a progress UI.
 */
cardRouter.get('/onboard/:id', async (req, res) => {
  const session = await getSession(req.params.id);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  res.json({
    ok:           true,
    sessionId:    session.id,
    walletAddress: session.walletAddress,
    status:       session.status,
    safeAddress:  session.safeAddress,
    cardId:       session.cardId,
    error:        session.error,
    updatedAt:    session.updatedAt,
  });
});

/**
 * POST /api/card/onboard/:id/terms
 * Accept Gnosis Pay Terms & Conditions.
 * Automatically fetches current term IDs from GP API and accepts them.
 */
cardRouter.post('/onboard/:id/terms', async (req, res) => {
  try {
    const session = await acceptTerms(req.params.id);
    res.json({ ok: true, status: session.status, nextStep: `GET /api/card/onboard/${session.id}/kyc` });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * GET /api/card/onboard/:id/kyc
 * Get a Sumsub access token so the frontend can render the KYC SDK widget.
 * User completes identity verification in the widget.
 * Sumsub fires our webhook when approved → we auto-deploy the Safe.
 */
cardRouter.get('/onboard/:id/kyc', async (req, res) => {
  try {
    const { kycToken, kycUrl } = await getKycToken(req.params.id);
    res.json({ ok: true, kycToken, kycUrl, sdk: '@sumsub/websdk-react' });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/card/onboard/:id/card
 * Create the virtual card once Safe is deployed.
 * Call this after polling /api/card/onboard/:id shows status === 'awaiting_card'.
 */
cardRouter.post('/onboard/:id/card', async (req, res) => {
  try {
    // Re-poll Safe status first to keep it fresh
    await pollSafeDeployment(req.params.id);
    const session = await createVirtualCard(req.params.id);
    res.json({
      ok:          true,
      status:      session.status,
      cardId:      session.cardId,
      safeAddress: session.safeAddress,
      message:     'Virtual card created. Fund your Safe and start spending on 80M+ Visa merchants.',
      topupEndpoint: '/api/card/topup',
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/card/onboard/sumsub-webhook
 * Sumsub fires this when a user completes KYC review.
 * Must be registered as webhook URL in your Sumsub dashboard.
 * Session ID is passed as a query param when registering the webhook URL.
 */
cardRouter.post('/onboard/sumsub-webhook', async (req, res) => {
  const { reviewStatus, externalUserId } = req.body as {
    reviewStatus?: string;
    externalUserId?: string; // we set this to sessionId when creating Sumsub applicant
  };

  // Acknowledge immediately — Sumsub retries on non-200
  res.json({ ok: true });

  if (reviewStatus === 'completed' && externalUserId) {
    try {
      await onKycApproved(externalUserId);
      // Kick off Safe polling in the background
      let attempts = 0;
      const poll = async () => {
        if (attempts++ > 20) return; // give up after ~5 min
        const s = await pollSafeDeployment(externalUserId).catch(() => null);
        if (s?.status === 'awaiting_card') return; // done
        setTimeout(poll, 15_000);
      };
      poll();
    } catch (err) {
      console.error('[sumsub-webhook] KYC approval handler failed:', err);
    }
  }
});

// ─── Product info ─────────────────────────────────────────────────────────────

/**
 * GET /api/card
 * Product overview — available currencies, fees, endpoints.
 */
cardRouter.get('/', (_req, res) => {
  res.json({
    product:  'Gnosis Pay Card via x402',
    network:  'Gnosis Chain (EVM, Chain ID 100)',
    products: {
      topup: {
        description:    'Top up your Gnosis Pay Safe directly from Solana USDC',
        fee:            `${config.TOPUP_FEE_PCT}% of bridged amount`,
        currencies:     Object.keys(GNOSIS_TOKENS),
        estimatedTime:  '1-3 minutes',
        endpoints: {
          quote:  'GET  /api/card/topup/quote?amount=50&safeAddress=0x...&currency=USDCe',
          topup:  'POST /api/card/topup  [X-Payment: <solana-sig>]',
          status: 'GET  /api/card/topup/:orderId',
        },
      },
      onboarding: {
        description:    'Managed Gnosis Pay account setup — SIWE auth, KYC, Safe deployment, virtual card',
        fee:            `$${config.ONBOARD_FEE_USDC} USDC (one-time)`,
        requirements:   ['EVM wallet (MetaMask, Coinbase Wallet, etc.)', 'Government ID for KYC'],
        endpoints: {
          nonce:   'GET  /api/card/onboard/nonce?wallet=0x...',
          session: 'POST /api/card/onboard/session',
          pay:     'POST /api/card/onboard  [X-Payment: <solana-sig>]',
          status:  'GET  /api/card/onboard/:sessionId',
          terms:   'POST /api/card/onboard/:sessionId/terms',
          kyc:     'GET  /api/card/onboard/:sessionId/kyc',
          card:    'POST /api/card/onboard/:sessionId/card',
        },
      },
    },
  });
});
