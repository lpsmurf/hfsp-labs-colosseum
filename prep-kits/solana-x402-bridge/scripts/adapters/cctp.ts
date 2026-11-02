// Circle CCTP (Cross-Chain Transfer Protocol) adapter — DEFAULT BENCHMARK provider.
//
// CCTP is USDC->USDC ONLY: native 1:1 burn-and-mint with NO slippage and the lowest
// cost of any route. Every other provider is judged against this baseline.
//
// There is NO price API for CCTP — it is a protocol, not a marketplace. So the quote is
// COMPUTED LOCALLY here (we do not call an external quote endpoint). The Iris attestation
// service (https://iris-api.circle.com) is only needed for the execute/status path later.
//
// Flow (for the later execute phase, NOT used by quote()):
//   depositForBurn on Solana TokenMessenger -> poll Iris for attestation -> receiveMessage mint on EVM.
//
// NOTE: CCTP delivers NATIVE USDC on Polygon
//   (0x3c499c542cEF5E3811e1192ce70d8cc03d5c3359), but Polymarket settles in USDC.e
//   (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174). So a downstream swap may be needed for
//   the Polymarket leg even though CCTP itself is 1:1.

import type { EvmChain, BridgeResult } from "../types.js";
import type { BridgeProvider, ProviderQuote } from "../providers.js";

// Solana USDC mint (reference; used by the execute path, kept here for documentation).
const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// EVM chain IDs (reference for the execute path).
const CHAIN_IDS: Record<EvmChain, number> = {
  polygon: 137,
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  gnosis: 100,
};

// Honest, small estimate of the destination mint (receiveMessage) gas cost expressed in USD.
// These are rough, conservative numbers — gas is paid in the destination native token and
// converted to USD here purely so the aggregator can rank net amount-out consistently.
const DEST_GAS_USD: Record<EvmChain, number> = {
  polygon: 0.01,   // very cheap
  base: 0.02,      // L2, cheap
  arbitrum: 0.02,  // L2, cheap
  ethereum: 2.0,   // L1 mint is the expensive case
  gnosis: 0.01,    // xDai, very cheap
};

// CCTP v2 "fast transfer" is available on these chains. Fast transfers settle in ~30s and
// (optionally) carry a tiny fast-transfer fee. Chains not in this set use the STANDARD
// transfer, which waits for source finality (minutes) and is free (0 bps).
const FAST_TRANSFER_CHAINS: ReadonlySet<EvmChain> = new Set<EvmChain>([
  "base",
  "arbitrum",
  "ethereum",
]);

// CCTP standard transfer = 0 bps. We model CCTP v2 fast transfer with a tiny ~1 bp fee.
// Toggle modeling fast transfers via env; default is fast where supported (matches the
// "lowest cost, fastest" benchmark intent) but the fee stays honest and disclosed.
const FAST_TRANSFER_FEE_BPS = 1; // ~0.01%
const STANDARD_TRANSFER_FEE_BPS = 0;

// ETAs (seconds). Documented, reasonable values:
//   - CCTP v2 fast transfer: ~30s on supported chains.
//   - Standard CCTP: source finality before attestation, on the order of minutes — use ~120s.
const FAST_ETA_SECONDS = 30;
const STANDARD_ETA_SECONDS = 120;

const isUsdc = (t: string) => t.toLowerCase() === "usdc";

export const cctp: BridgeProvider = {
  name: "cctp",

  // USDC->USDC only (case-insensitive). chain is irrelevant to eligibility here.
  supportsPair(srcToken: string, _chain: EvmChain, destToken: string): boolean {
    return isUsdc(srcToken) && isUsdc(destToken);
  },

  async quote(
    srcToken: string,
    amountIn: number,
    chain: EvmChain,
    destToken: string,
  ): Promise<ProviderQuote> {
    if (!(isUsdc(srcToken) && isUsdc(destToken))) {
      throw new Error(
        `cctp.quote: unsupported pair ${srcToken}->${destToken} (CCTP is USDC->USDC only)`,
      );
    }

    const isFast = FAST_TRANSFER_CHAINS.has(chain);
    const bridgeFeeBps = isFast ? FAST_TRANSFER_FEE_BPS : STANDARD_TRANSFER_FEE_BPS;
    const etaSeconds = isFast ? FAST_ETA_SECONDS : STANDARD_ETA_SECONDS;

    // Destination gas (USD) — the only meaningful cost on a native 1:1 burn/mint route.
    const networkFeesUSDC = DEST_GAS_USD[chain] ?? 0.02;

    // Protocol fee (0 for standard, ~1 bp if modeling CCTP v2 fast). Disclosed honestly.
    const bridgeFeeUSDC = amountIn * (bridgeFeeBps / 10000);

    // Native 1:1 burn-and-mint: out = in minus protocol fee minus destination gas. No slippage.
    const amountOut = amountIn - bridgeFeeUSDC - networkFeesUSDC;

    return {
      kind: "bridge",
      route: "CCTP (burn/mint)",
      srcChain: "solana",
      srcToken,
      destChain: chain,
      destToken,
      amountIn,
      amountOut,
      bridgeFeeUSDC,
      bridgeFeeBps,
      networkFeesUSDC,
      priceImpactBps: 0, // native 1:1, no AMM, no impact
      minAmountOut: amountOut, // no slippage => min == expected
      slippageBps: 0,
      etaSeconds,
      feeRecipient: process.env.INTEGRATOR_FEE_ACCOUNT ?? "HFSP",
      relayer: process.env.X402_RELAYER_URL ?? "https://bridge.clawdrop.live",
      provider: "cctp",
      reliabilityScore: 0.99,
    };
  },

  // execute/status are intentionally stubbed for the quote-only MVP. The real path
  // (depositForBurn -> Iris attestation -> receiveMessage) lands in a later phase.
  // SOLANA_USDC_MINT / CHAIN_IDS above are the reference values that path will use.
  async execute(
    _srcToken: string,
    _amountIn: number,
    _chain: EvmChain,
    _destToken: string,
  ): Promise<BridgeResult> {
    throw new Error("cctp.execute not implemented in quote-only MVP — see PROVIDERS.md #1");
  },

  async status(_id: string): Promise<string> {
    throw new Error("cctp.status not implemented in quote-only MVP — see PROVIDERS.md #1");
  },
};

// Reference exports are kept local; silence unused warnings without exporting extra surface.
void SOLANA_USDC_MINT;
void CHAIN_IDS;
