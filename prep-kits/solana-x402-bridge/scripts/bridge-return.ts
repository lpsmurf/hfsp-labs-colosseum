// usage: tsx scripts/bridge-return.ts <amountUSDC> [--confirm]
// The RETURN leg of a round trip: Polygon -> Solana USDC via Allbridge.
// (The core aggregator is Solana-front-door; this dedicated utility runs the reverse
//  direction for round-trip demos.) EVM source: approve-if-needed then send, signed
//  locally with viem; the Solana wallet receives. Preview by default; broadcasts only
//  with --confirm. No funds move without --confirm.
import "./env.js";

async function main(amount: number, confirm: boolean) {
  const evmPk = process.env.EVM_WALLET_PRIVATE_KEY;
  const solSk = process.env.SOLANA_WALLET_PRIVATE_KEY;
  if (!evmPk) throw new Error("bridge-return: EVM_WALLET_PRIVATE_KEY not set in .env");
  if (!solSk) throw new Error("bridge-return: SOLANA_WALLET_PRIVATE_KEY (recipient) not set in .env");
  if (!process.env.POLYGON_RPC_URL) throw new Error("bridge-return: POLYGON_RPC_URL not set");

  const mod: any = await import("@allbridge/bridge-core-sdk");
  const { createWalletClient, createPublicClient, http } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { polygon } = await import("viem/chains");
  const web3: any = await import("@solana/web3.js");
  const bs58 = (await import("bs58")).default;

  const solAddr = web3.Keypair.fromSecretKey(bs58.decode(solSk)).publicKey.toBase58();
  const account = privateKeyToAccount(evmPk as `0x${string}`);
  const evmAddr = account.address;

  const nodeUrls: any = {};
  if (process.env.SOLANA_RPC_URL) nodeUrls.SOL = process.env.SOLANA_RPC_URL;
  nodeUrls.POL = process.env.POLYGON_RPC_URL;

  const sdk = new mod.AllbridgeCoreSdk(nodeUrls);
  const tokens: any[] = await sdk.tokens();
  const eq = (a: string, b: string) => a?.toUpperCase() === b?.toUpperCase();
  const source = tokens.find((t) => t.chainSymbol === "POL" && eq(t.symbol, "USDC"));
  const dest = tokens.find((t) => t.chainSymbol === "SOL" && eq(t.symbol, "USDC"));
  if (!source || !dest) throw new Error("bridge-return: Polygon USDC -> Solana USDC pool not found");

  const out = Number(await sdk.getAmountToBeReceived(String(amount), source, dest));

  console.log("=== RETURN BRIDGE PLAN (Polygon -> Solana) ===");
  console.log(JSON.stringify({
    provider: "allbridge",
    amountIn: `${amount} USDC (polygon)`,
    expectedOut: `${out} USDC (solana)`,
    from: evmAddr,
    to: solAddr,
    gasToken: "MATIC",
  }, null, 2));

  if (!confirm) {
    console.log("\nDRY-RUN — no funds moved. Re-run with --confirm to broadcast (moves REAL funds).");
    return;
  }

  const walletClient = createWalletClient({ account, chain: polygon, transport: http(process.env.POLYGON_RPC_URL) });
  const publicClient = createPublicClient({ chain: polygon, transport: http(process.env.POLYGON_RPC_URL) });
  const sendRaw = async (tx: any): Promise<string> => {
    const hash = await walletClient.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n });
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  };

  // Approve the bridge to spend USDC if the current allowance is insufficient.
  const enough = await sdk.bridge.checkAllowance({
    token: source, owner: evmAddr,
    gasFeePaymentMethod: mod.FeePaymentMethod.WITH_NATIVE_CURRENCY,
    amount: String(amount),
  });
  if (!enough) {
    console.log("approving USDC spend (allowance insufficient)...");
    const approveTx = await sdk.bridge.rawTxBuilder.approve({ token: source, owner: evmAddr });
    console.log("approve tx:", await sendRaw(approveTx));
  }

  console.log("--confirm set → broadcasting Polygon->Solana send...");
  const sendTx = await sdk.bridge.rawTxBuilder.send({
    amount: String(amount),
    fromAccountAddress: evmAddr,
    toAccountAddress: solAddr,
    sourceToken: source,
    destinationToken: dest,
    messenger: mod.Messenger.ALLBRIDGE,
  });
  const hash = await sendRaw(sendTx);
  console.log("=== EXECUTED ===");
  console.log(JSON.stringify({
    sourceTx: hash,
    sourceExplorer: `https://polygonscan.com/tx/${hash}`,
    destWallet: solAddr,
    destExplorer: `https://explorer.solana.com/address/${solAddr}`,
    note: "Allbridge relayer mints USDC on Solana shortly",
  }, null, 2));
}

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const amount = Number(args.find((a) => !a.startsWith("--")) ?? "0.5");
main(amount, confirm).catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
