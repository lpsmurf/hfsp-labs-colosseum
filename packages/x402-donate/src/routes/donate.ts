import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { findCharity } from '../catalog.js';
import { verifyAndRoute } from '../router.js';
import { BASE_USDC, FEES, config } from '../config.js';
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

  const amount      = Math.max(Number(req.query.amount ?? 1), 0.01);
  const amountMicro = Math.round(amount * 1_000_000).toString();
  const resource    = `${req.protocol}://${req.get('host')}${req.path}`;

  const serviceFeeUsdc    = amount * FEES.servicePct / 100;
  const endaomentFeeUsdc  = (amount - serviceFeeUsdc) * FEES.endaomentAdminPct / 100;
  const netToCharityUsdc  = amount - serviceFeeUsdc - endaomentFeeUsdc;

  res.status(402).json({
    x402Version: 1,
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
    accepts: [
      {
        scheme:            'exact',
        network:           'base-mainnet',
        maxAmountRequired: amountMicro,
        asset:             BASE_USDC,
        payTo:             config.ROUTER_CONTRACT_ADDRESS,
        resource,
        description:       `Donate to ${charity.name} via x402-donate / Endaoment`,
        mimeType:          'application/json',
        maxTimeoutSeconds: 300,
      },
    ],
    howToPay: [
      `1. Send ${amount.toFixed(2)} USDC (${BASE_USDC}) on Base to the DonationRouter: ${config.ROUTER_CONTRACT_ADDRESS}`,
      `2. POST to this URL with header  X-Payment: <txHash>`,
      `3. Service calls route() on-chain → ${netToCharityUsdc.toFixed(4)} USDC reaches ${charity.name}`,
    ],
  });
});

// POST /donate/:id
// Header: X-Payment: <Base USDC tx hash>
// Body (optional): { amount: number }
donateRouter.post('/:id', verifyLimiter, async (req, res) => {
  const txHash = (req.headers['x-payment'] as string | undefined)?.trim();
  if (!txHash) {
    res.status(400).json({ error: 'Missing X-Payment header (Base tx hash of USDC sent to DonationRouter)' });
    return;
  }

  const charity = await findCharity(req.params.id).catch(() => null);
  if (!charity) {
    res.status(404).json({ error: 'Charity not found' });
    return;
  }

  const minUsdc = Math.max(Number(req.body?.amount ?? req.query.amount ?? 0.01), 0.01);

  const { ok, error, paidUsdc, netToCharityUsdc, routeTxHash } =
    await verifyAndRoute(txHash, charity.baseAddress, minUsdc);

  if (!ok) {
    res.status(402).json({ error });
    return;
  }

  const receipt: DonationReceipt = {
    charityId:        charity.id,
    charityName:      charity.name,
    baseAddress:      charity.baseAddress,
    txHash,
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
