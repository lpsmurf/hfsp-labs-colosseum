// Compatibility export. The common gate settles both fixed and body-priced
// routes before fulfillment, independent of Express router mount paths.
import { makeX402Gate } from './x402.js';
import { config } from '../config.js';
export const sdkGate = makeX402Gate({
  amountUsdc: Number(config.ONBOARD_FEE_USDC),
  description: `Gnosis Pay onboarding — managed Safe deployment + virtual card ($${config.ONBOARD_FEE_USDC} USDC)`,
  resource: '/api/card/onboard',
});
