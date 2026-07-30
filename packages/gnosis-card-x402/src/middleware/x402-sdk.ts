/**
 * Fully standard x402 V2 gate for fixed-price routes.
 *
 * Everything here settles through a facilitator, so a stock `@x402/fetch` or
 * `@x402/axios` client can pay without knowing anything about us. Routes whose
 * price is derived from the request body cannot use this — see `makeX402Gate` in
 * ./x402.ts for why — so this covers the fixed-price surface only.
 */

import type { Request, Response, NextFunction } from 'express';
import {
  createResourceServer,
  buildGate,
  multiGate,
  type RoutesConfig,
} from '@hfsp/x402-common';
import { config } from '../config.js';

export const routes: RoutesConfig = {
  'POST /api/card/onboard': multiGate(
    `Gnosis Pay onboarding — managed Safe deployment + virtual card ($${config.ONBOARD_FEE_USDC} USDC)`,
    [
      {
        price:       parseFloat(config.ONBOARD_FEE_USDC),
        payTo:       config.WALLET_PUBLIC_KEY,
        network:     'solana',
        description: 'Gnosis Pay onboarding (Solana USDC)',
      },
      {
        price:       parseFloat(config.ONBOARD_FEE_USDC),
        payTo:       config.EVM_WALLET_ADDRESS,
        network:     'base',
        description: 'Gnosis Pay onboarding (Base USDC)',
      },
    ],
  ),
};

const server = createResourceServer({
  facilitatorUrl: config.FACILITATOR_URL,
  families:       ['evm', 'svm'],
  networks:       ['base', 'solana'],
});

const gate = buildGate(routes, server);

/**
 * Run the standard gate only for clients that speak V2.
 *
 * A caller still using `X-Payment` falls through to the route's own
 * `makeX402Gate`, which knows how to verify a tx hash. Without this split the
 * migration would break every existing integration on day one.
 */
export function sdkGate(req: Request, res: Response, next: NextFunction) {
  const v2 = (req.headers['payment-signature'] as string | undefined)?.trim();
  if (!v2) return next();
  return gate(req, res, next);
}
