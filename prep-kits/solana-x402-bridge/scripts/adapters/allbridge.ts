// Allbridge Core adapter — stablecoin (USDC/USDT) Solana <-> EVM pools.
// Uses the official @allbridge/bridge-core-sdk (getAmountToBeReceived). The SDK is
// imported LAZILY inside quote() so a load/network failure is isolated to this
// provider — the aggregator simply skips it (it catches throwing providers).
// NOTE: the SDK fetches pool data from Allbridge's Core API; if that host is
// unreachable, this adapter throws and is skipped (the other providers still work).
import type { EvmChain, BridgeResult } from "../types.js";
import type { BridgeProvider, ProviderQuote } from "../providers.js";

// Allbridge ChainSymbol per supported EVM chain. Gnosis is NOT supported by Allbridge Core.
const CHAIN_SYMBOL: Partial<Record<EvmChain, string>> = {
  polygon: "POL", ethereum: "ETH", base: "BAS", arbitrum: "ARB",
};

const isStable = (t: string) => ["usdc", "usdt"].includes(t.toLowerCase());

// Build the SDK node-url map from env (only chains we have RPCs for).
function nodeUrls(): Record<string, string> {
  const urls: Record<string, string> = {};
  if (process.env.SOLANA_RPC_URL) urls.SOL = process.env.SOLANA_RPC_URL;
  if (process.env.POLYGON_RPC_URL) urls.POL = process.env.POLYGON_RPC_URL;
  if (process.env.ETHEREUM_RPC_URL) urls.ETH = process.env.ETHEREUM_RPC_URL;
  if (process.env.BASE_RPC_URL) urls.BAS = process.env.BASE_RPC_URL;
  if (process.env.ARBITRUM_RPC_URL) urls.ARB = process.env.ARBITRUM_RPC_URL;
  return urls;
}

export const allbridge: BridgeProvider = {
  name: "allbridge",
  // Stablecoin pools only (USDC/USDT), and only on Allbridge-supported EVM chains.
  supportsPair: (s, c, d) => isStable(s) && isStable(d) && !!CHAIN_SYMBOL[c],

  async quote(srcToken, amountIn, chain, destToken): Promise<ProviderQuote> {
    const sym = CHAIN_SYMBOL[chain];
    if (!sym) throw new Error(`allbridge: chain '${chain}' not supported`);

    // Lazy import keeps a heavy/optional dep out of the module graph.
    const mod: any = await import("@allbridge/bridge-core-sdk");
    const sdk = new mod.AllbridgeCoreSdk(nodeUrls());

    // tokens() hits Allbridge's Core API — throws here if unreachable (-> aggregator skips).
    const tokens: any[] = await sdk.tokens();
    const eq = (a: string, b: string) => a?.toUpperCase() === b?.toUpperCase();
    const source = tokens.find((t) => t.chainSymbol === "SOL" && eq(t.symbol, srcToken));
    const dest = tokens.find((t) => t.chainSymbol === sym && eq(t.symbol, destToken));
    if (!source || !dest) throw new Error(`allbridge: no pool for ${srcToken} (SOL) -> ${destToken} (${sym})`);

    const amountOut = Number(await sdk.getAmountToBeReceived(String(amountIn), source, dest));
    if (!Number.isFinite(amountOut) || amountOut <= 0) throw new Error("allbridge: invalid quote");

    // Stablecoin pool transfer: net of pool + bridge fee, ~no price impact for balanced pools.
    const bridgeFeeUSDC = Math.max(0, amountIn - amountOut);
    const bridgeFeeBps = amountIn > 0 ? (bridgeFeeUSDC / amountIn) * 10000 : 0;
    const slippageBps = Number(process.env.DEFAULT_SLIPPAGE_BPS ?? 50);

    let etaSeconds = 120;
    try {
      const ms = await sdk.getAverageTransferTime(source, dest, mod.Messenger?.ALLBRIDGE);
      if (Number.isFinite(ms) && ms > 0) etaSeconds = Math.round(ms / 1000);
    } catch { /* fall back to default eta */ }

    return {
      kind: "bridge",
      route: "Allbridge Core",
      srcChain: "solana",
      srcToken,
      destChain: chain,
      destToken,
      amountIn,
      amountOut,
      bridgeFeeUSDC,
      bridgeFeeBps,
      networkFeesUSDC: 0, // gas paid separately in the native token
      priceImpactBps: 0,
      minAmountOut: amountOut * (1 - slippageBps / 10000),
      slippageBps,
      etaSeconds,
      feeRecipient: process.env.INTEGRATOR_FEE_ACCOUNT ?? "HFSP",
      relayer: process.env.X402_RELAYER_URL ?? "https://bridge.clawdrop.live",
      provider: "allbridge",
      reliabilityScore: 0.85,
    };
  },

  // Real execution: build the Solana send tx via the SDK, sign locally, broadcast.
  // Non-custodial — the agent's own Solana key signs; Allbridge's relayer delivers on the
  // destination. Only ever called by bridge-execute AFTER preflight + requote + --confirm.
  async execute(srcToken, amountIn, chain, destToken): Promise<BridgeResult> {
    const sym = CHAIN_SYMBOL[chain];
    if (!sym) throw new Error(`allbridge: chain '${chain}' not supported`);
    const sk = process.env.SOLANA_WALLET_PRIVATE_KEY;
    if (!sk) throw new Error("allbridge.execute: SOLANA_WALLET_PRIVATE_KEY not set in .env");
    const evmPk = process.env.EVM_WALLET_PRIVATE_KEY;
    if (!evmPk) throw new Error("allbridge.execute: EVM_WALLET_PRIVATE_KEY (recipient) not set in .env");

    const mod: any = await import("@allbridge/bridge-core-sdk");
    const web3: any = await import("@solana/web3.js");
    const bs58 = (await import("bs58")).default;
    const { privateKeyToAccount } = await import("viem/accounts");

    const sdk = new mod.AllbridgeCoreSdk(nodeUrls());
    const tokens: any[] = await sdk.tokens();
    const eq = (a: string, b: string) => a?.toUpperCase() === b?.toUpperCase();
    const source = tokens.find((t) => t.chainSymbol === "SOL" && eq(t.symbol, srcToken));
    const dest = tokens.find((t) => t.chainSymbol === sym && eq(t.symbol, destToken));
    if (!source || !dest) throw new Error(`allbridge: no pool for ${srcToken} (SOL) -> ${destToken} (${sym})`);

    const keypair = web3.Keypair.fromSecretKey(bs58.decode(sk));
    const fromAddress = keypair.publicKey.toBase58();
    const toAddress = privateKeyToAccount(evmPk as `0x${string}`).address;

    // Build (validates the route; throws here if unsupported — before any broadcast).
    const rawTx: any = await sdk.bridge.rawTxBuilder.send({
      amount: String(amountIn),
      fromAccountAddress: fromAddress,
      toAccountAddress: toAddress,
      sourceToken: source,
      destinationToken: dest,
      messenger: mod.Messenger.ALLBRIDGE,
      txFeeParams: { solana: mod.SolanaAutoTxFee },
    });

    rawTx.sign([keypair]);
    const connection = new web3.Connection(process.env.SOLANA_RPC_URL!, "confirmed");
    const sig = await connection.sendTransaction(rawTx);
    await connection.confirmTransaction(sig, "confirmed");

    return {
      sourceTx: sig,
      destTx: "pending — Allbridge relayer delivers on destination (poll status)",
      statusId: sig,
      sourceExplorer: `https://explorer.solana.com/tx/${sig}`,
      destExplorer: `https://polygonscan.com/address/${toAddress}`,
    };
  },

  async status(id: string): Promise<string> {
    try {
      const mod: any = await import("@allbridge/bridge-core-sdk");
      const sdk = new mod.AllbridgeCoreSdk(nodeUrls());
      const st = await sdk.getTransferStatus?.("SOL", id);
      return st ? JSON.stringify(st) : `submitted: ${id}`;
    } catch { return `submitted: ${id}`; }
  },
};
