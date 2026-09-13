/**
 * @hfsp/x402-common — shared x402 V2 building blocks.
 *
 * See packages/x402-common/README.md for the migration guide.
 */

export {
  NETWORKS,
  USDC,
  EIP712_DOMAIN,
  STABLECOINS,
  stablecoin,
  type StablecoinSymbol,
  type StablecoinInfo,
  isMainnet,
  isEvm,
  usdc,
  usdcToDollars,
  type NetworkName,
  type NetworkId,
} from "./networks.js";

export {
  FACILITATORS,
  DEFAULT_FACILITATOR,
  createResourceServer,
  gate,
  multiGate,
  buildGate,
  type ResourceServerOptions,
  type GateOptions,
  type RoutesConfig,
  type RouteConfig,
  type PaymentOption,
} from "./server.js";

export { createPrepaidGate, type SettledPayment } from './prepaid.js';

export {
  HEADER,
  buildChallenge,
  encode,
  decode,
  send402,
  attachReceipt,
  readProof,
  type ChallengeOptions,
  type PaymentRequiredV2,
} from "./legacy.js";
