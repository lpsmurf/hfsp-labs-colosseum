/**
 * x402 V2 payment gate for the donation router.
 *
 * Donations are variable-amount, so the price is resolved per request from
 * `?amount=` rather than fixed in the route config. `payTo` is always the
 * DonationRouter contract — the split to the charity happens on-chain in
 * `route()`, which is what makes the 3% service fee auditable rather than
 * a claim in a JSON body.
 *
 * The legacy `X-Payment` tx-hash flow still works; see `usesLegacyPayment`.
 */

import type { Request, Response, NextFunction } from 'express';
import {
  createResourceServer,
  buildGate,
  NETWORKS,
  USDC,
  EIP712_DOMAIN,
  usdc,
  usdcToDollars,
  type RoutesConfig,
} from '@hfsp/x402-common';
import { config } from './config.js';
import { findCharity } from './catalog.js';
import { routeOnChain } from './router.js';

/** Donations below this are not worth the gas to route on-chain. */
const MIN_DONATION_USDC = 0.01;

export function resolveAmount(raw: unknown): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(n) ? Math.max(n, MIN_DONATION_USDC) : MIN_DONATION_USDC;
}

export const routes: RoutesConfig = {
  'POST /donate/:id': {
    accepts: [{
      scheme:  'exact',
      payTo:   config.ROUTER_CONTRACT_ADDRESS,
      network: NETWORKS.base,
      // Dynamic: the donor chooses the amount, so it cannot be baked into config.
      price: (ctx) => ({
        asset:  USDC.base,
        extra: EIP712_DOMAIN.base,
        amount: usdc(resolveAmount(ctx.adapter.getQueryParams?.().amount)),
      }),
      maxTimeoutSeconds: 300,
    }],
    description: 'Donate USDC to a verified nonprofit via Endaoment',
    mimeType:    'application/json',
  },
};

const server = createResourceServer({
  facilitatorUrl: config.FACILITATOR_URL,
  families:       ['evm'],
  networks:       ['base'],
});

/**
 * Split the donation on-chain once the facilitator has settled it.
 *
 * This cannot live in the route handler. x402 settles *after* the handler returns
 * — the middleware wraps `res.end` and calls the facilitator on the way out — so
 * at handler time the donor's USDC has not reached the DonationRouter yet and
 * `route()` would revert on a zero balance.
 */
server.onAfterSettle(async (ctx) => {
  if (!ctx.result.success) return;

  const path = (ctx.transportContext as { request?: { path?: string } })?.request?.path ?? '';
  const charityId = path.split('/').filter(Boolean).pop();
  if (!charityId) {
    console.error('[x402] settled a donation but could not read the charity id from', path);
    return;
  }

  const charity = await findCharity(charityId).catch(() => null);
  if (!charity) {
    console.error(`[x402] settled a donation for unknown charity "${charityId}"`);
    return;
  }

  const paidUsdc = usdcToDollars(ctx.requirements.amount);
  const result   = await routeOnChain(ctx.result.transaction, charity.baseAddress, paidUsdc);

  if (!result.ok) {
    // The donor has paid and the money is in the router contract; only the split
    // failed. Loud, because it needs a manual sweep — not a silent drop.
    console.error(
      `[x402] SETTLED BUT NOT ROUTED — $${paidUsdc} for ${charity.name} ` +
      `(settlement ${ctx.result.transaction}): ${result.error}`,
    );
    return;
  }

  console.log(`[x402] routed $${paidUsdc} → ${charity.name} via ${result.routeTxHash}`);
});

const gate = buildGate(routes, server);

export function x402Gate(req: Request, res: Response, next: NextFunction) {
  if (usesLegacyPayment(req)) return next();
  return gate(req, res, next);
}

export function usesLegacyPayment(req: Request): boolean {
  const legacy = (req.headers['x-payment'] as string | undefined)?.trim();
  const v2     = (req.headers['payment-signature'] as string | undefined)?.trim();
  return Boolean(legacy) && !v2;
}
