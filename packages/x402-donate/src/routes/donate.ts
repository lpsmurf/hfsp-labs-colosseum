import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { findCharity } from '../catalog.js';
import { verifyAndRoute } from '../router.js';
import { BASE_USDC, FEES, config } from '../config.js';
import { NETWORKS, USDC as USDC_ASSET, usdc, encode, HEADER, attachReceipt , EIP712_DOMAIN} from '@hfsp/x402-common';
import { usesLegacyPayment, resolveAmount } from '../x402.js';
import type { DonationReceipt } from '../types.js';

export const donateRouter = Router();

const verifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many donation attempts — try again in 5 minutes' },
});

// GET /donate/:id?amount=5.00
// Returns 402 with payTo = DonationRouter contract + full cost breakdown.
donateRouter.get('/:id', async (req, res) => {
  const charity = await findCharity(req.params.id).catch(() => null);
  if (!charity) {
    res.status(404).json({ error: 'Charity not found — try GET /charities?search=name' });
    return;
  }

  const amount   = resolveAmount(req.query.amount ?? 1);
  const resource = `${req.protocol}://${req.get('host')}${req.path}`;

  const serviceFeeUsdc    = amount * FEES.servicePct / 100;
  const endaomentFeeUsdc  = (amount - serviceFeeUsdc) * FEES.endaomentAdminPct / 100;
  const netToCharityUsdc  = amount - serviceFeeUsdc - endaomentFeeUsdc;

  const challenge = {
    x402Version: 2 as const,
    resource: {
      url:         resource,
      description: `Donate $${amount.toFixed(2)} USDC to ${charity.name}`,
      mimeType:    'application/json',
    },
    accepts: [{
      scheme:            'exact',
      network:           NETWORKS.base,
      amount:            usdc(amount),
      asset:             USDC_ASSET.base,
      payTo:             config.ROUTER_CONTRACT_ADDRESS,
      maxTimeoutSeconds: 300,
      // Required for EIP-3009 signing — see EIP712_DOMAIN.
      extra:             EIP712_DOMAIN.base,
    }],
  };

  res.set(HEADER.required, encode(challenge)).status(402).json({
    ...challenge,
    error:       'Payment required to complete donation',
    description: `Donate $${amount.toFixed(2)} USDC to ${charity.name}`,
    charity: {
      id:          charity.id,
      name:        charity.name,
      slug:        charity.slug,
      ein:         charity.ein,
      category:    charity.category,
      website:     charity.website,
      logo:        charity.logo,
      description: charity.description,
      totalRaisedUsdc: charity.totalRaisedUsdc,
    },
    costBreakdown: {
      donationAmountUsdc:  amount,
      serviceFee:          `${FEES.servicePct}% (${serviceFeeUsdc.toFixed(4)} USDC) — split on-chain by DonationRouter`,
      endaomentAdminFee:   `${FEES.endaomentAdminPct}% (${endaomentFeeUsdc.toFixed(4)} USDC) — deducted by Endaoment`,
      gasEstimate:         `~$${FEES.gasEstimateUsd} on Base (donor tx) + ~$0.002 (route tx paid by service)`,
      netToCharityUsdc:    parseFloat(netToCharityUsdc.toFixed(4)),
      feesNote:            'The 3% service fee is enforced transparently on-chain — visible in DonationRouter contract events. We pay gas for the route() call.',
    },
    howToPay: [
      `Preferred: POST to this URL with a PAYMENT-SIGNATURE header (any x402 V2 client, e.g. @x402/fetch)`,
      `Legacy 1. Send ${amount.toFixed(2)} USDC (${BASE_USDC}) on Base to the DonationRouter: ${config.ROUTER_CONTRACT_ADDRESS}`,
      `Legacy 2. POST to this URL with header  X-Payment: <txHash>`,
      `Either way: service calls route() on-chain → ${netToCharityUsdc.toFixed(4)} USDC reaches ${charity.name}`,
    ],
  });
});

// POST /donate/:id
// Header: X-Payment: <Base USDC tx hash>
// Body (optional): { amount: number }
donateRouter.post('/:id', verifyLimiter, async (req, res) => {
  const legacy = usesLegacyPayment(req);
  const txHash = (req.headers['x-payment'] as string | undefined)?.trim();

  if (legacy && !txHash) {
    res.status(400).json({ error: 'Missing X-Payment header (Base tx hash of USDC sent to DonationRouter)' });
    return;
  }

  const charity = await findCharity(req.params.id).catch(() => null);
  if (!charity) {
    res.status(404).json({ error: 'Charity not found' });
    return;
  }

  const minUsdc = resolveAmount(req.body?.amount ?? req.query.amount);

  // V2 path: payment is verified but NOT yet settled — x402 settles after this
  // handler returns. The on-chain split runs in the afterSettle hook in x402.ts,
  // so there is no routeTxHash to report here. The client's proof of payment is
  // the PAYMENT-RESPONSE header the middleware attaches on the way out.
  if (!legacy) {
    const fee = minUsdc * FEES.servicePct / 100;
    res.status(200).json({
      success: true,
      pending: true,
      charity: { id: charity.id, name: charity.name, baseAddress: charity.baseAddress },
      donationUsdc: minUsdc,
      estimatedNetToCharityUsdc: parseFloat((minUsdc - fee - (minUsdc - fee) * FEES.endaomentAdminPct / 100).toFixed(4)),
      message: `Thank you! Your donation to ${charity.name} is settling on-chain now.`,
      note: 'Settlement details are in the PAYMENT-RESPONSE header. The 97/3 split is executed by DonationRouter immediately after settlement.',
      onChainProof: {
        routerContract: `https://basescan.org/address/${config.ROUTER_CONTRACT_ADDRESS}`,
        endaomentOrg:   `https://app.endaoment.org/orgs/${charity.ein ?? charity.id}`,
      },
    });
    return;
  }

  const { ok, error, paidUsdc, netToCharityUsdc, routeTxHash } =
    await verifyAndRoute(txHash!, charity.baseAddress, minUsdc);

  if (!ok) {
    res.status(402).json({ error });
    return;
  }

  attachReceipt(res, {
    success:     true,
    network:     'base',
    transaction: routeTxHash ?? txHash!,
  });

  const receipt: DonationReceipt = {
    charityId:        charity.id,
    charityName:      charity.name,
    baseAddress:      charity.baseAddress,
    txHash:           txHash!,
    routeTxHash:      routeTxHash ?? null,
    paidUsdc,
    netToCharityUsdc: netToCharityUsdc ?? 0,
    timestamp:        new Date().toISOString(),
  };

  res.status(200).json({
    success: true,
    receipt,
    message: `Thank you! $${(netToCharityUsdc ?? 0).toFixed(2)} USDC is on its way to ${charity.name}.`,
    onChainProof: {
      donorTx:    `https://basescan.org/tx/${txHash}`,
      routeTx:    routeTxHash ? `https://basescan.org/tx/${routeTxHash}` : null,
      routerContract: `https://basescan.org/address/${config.ROUTER_CONTRACT_ADDRESS}`,
      endaomentOrg:   `https://app.endaoment.org/orgs/${charity.ein ?? charity.id}`,
    },
  });
});
