/**
 * x402 V2 payment gate for the audit API.
 *
 * Two payment paths are live at once:
 *
 *   V2 (preferred) — client signs an authorization, sends `PAYMENT-SIGNATURE`,
 *   the facilitator verifies and settles. This is what standard `@x402/*` clients
 *   speak, and until this existed none of them could pay us at all.
 *
 *   Legacy — client broadcasts a USDC transfer itself and sends the tx hash in
 *   `X-Payment`, which src/verify.ts checks against the chain. Kept so existing
 *   integrations keep working; see `skipIfLegacyPayment` for how the two coexist.
 */

import type { Request, Response, NextFunction } from 'express';
import {
  createResourceServer,
  buildGate,
  multiGate,
  FACILITATORS,
  type GateOptions,
  type NetworkName,
  type RoutesConfig,
} from '@hfsp/x402-common';
import { config, AUDIT_PRICE_USDC } from './config.js';

/**
 * Celo is opt-in: a half-configured Celo option would advertise a payment the
 * facilitator then refuses to settle, which is worse than not offering it.
 */
const celoKey = config.PAYMENT_RECIPIENT_CELO && config.CELO_FACILITATOR_API_KEY
  ? config.CELO_FACILITATOR_API_KEY
  : undefined;

const options: GateOptions[] = [
  {
    price:       AUDIT_PRICE_USDC,
    payTo:       config.PAYMENT_RECIPIENT_BASE,
    network:     'base',
    description: 'x402 security audit (Base USDC)',
  },
  {
    price:       AUDIT_PRICE_USDC,
    payTo:       config.PAYMENT_RECIPIENT_SOL,
    network:     'solana',
    description: 'x402 security audit (Solana USDC)',
  },
  ...(celoKey ? [{
    price:       AUDIT_PRICE_USDC,
    payTo:       config.PAYMENT_RECIPIENT_CELO!,
    network:     config.CELO_NETWORK,
    description: 'x402 security audit (Celo USDC)',
  }] : []),
];

export const enabledNetworks: NetworkName[] = options.map(o => o.network);

export const routes: RoutesConfig = {
  'POST /audit': multiGate(
    'x402 security audit — static + dynamic analysis of a public GitHub repo',
    options,
  ),
};

const server = createResourceServer({
  facilitatorUrl:    config.FACILITATOR_URL,
  families:          ['evm', 'svm'],
  networks:          enabledNetworks,
  extraFacilitators: celoKey ? [{ url: FACILITATORS[config.CELO_NETWORK], apiKey: celoKey }] : [],
});

const gate = buildGate(routes, server);

/**
 * Run the x402 gate unless the caller is using the legacy tx-hash flow.
 *
 * Without this the gate would 402 every legacy request before it reached the
 * handler that knows how to verify it — the migration would be a hard break for
 * every existing integration rather than an addition.
 */
export function x402Gate(req: Request, res: Response, next: NextFunction) {
  if (usesLegacyPayment(req)) return next();
  return gate(req, res, next);
}

export function usesLegacyPayment(req: Request): boolean {
  const legacy = (req.headers['x-payment'] as string | undefined)?.trim();
  const v2     = (req.headers['payment-signature'] as string | undefined)?.trim();
  // A client sending both is treated as V2 — the newer path wins.
  return Boolean(legacy) && !v2;
}
