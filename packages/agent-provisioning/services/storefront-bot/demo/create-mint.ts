// Creates a demo SPL mint on devnet, a funded payer ATA and the platform ATA.
// Prints ONLY the mint address to stdout (the runner captures it).
// Usage: npx ts-node demo/create-mint.ts <platform-wallet-pubkey>
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';
import fs from 'node:fs';
import path from 'node:path';

const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const PLATFORM_WALLET = process.argv[2];
const PAYER_FILE = process.env.DEMO_PAYER_FILE ?? path.join(process.cwd(), '.demo', 'payer.json');
const DECIMALS = 6;

if (!PLATFORM_WALLET) {
  console.error('usage: create-mint.ts <platform-wallet-pubkey>');
  process.exit(1);
}

const conn = new Connection(RPC, { commitment: 'confirmed', disableRetryOnRateLimit: true });

async function airdrop(pubkey: PublicKey, sol: number) {
  for (let i = 0; i < 4; i++) {
    try {
      const sig = await conn.requestAirdrop(pubkey, sol * 1e9);
      await confirmSig(sig);
      return;
    } catch (err) {
      console.error(`airdrop attempt ${i + 1} failed:`, (err as Error)?.message ?? err);
      await new Promise(r => setTimeout(r, 4000 * (i + 1)));
    }
  }
  throw new Error(`airdrop failed — fund ${pubkey.toBase58()} manually`);
}

// Poll instead of confirmTransaction — confirmTransaction uses a websocket on
// rpcPort+1, which the runner assigns to the faucet.
export async function confirmSig(sig: string) {
  for (let i = 0; i < 30; i++) {
    const st = await conn.getSignatureStatuses([sig]);
    const s = st.value[0];
    if (s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized') {
      if (s.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(s.err)}`);
      return;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`tx ${sig} not confirmed`);
}

async function main() {
  // DEMO_PAYER_SECRET: base58 or JSON-array secret key for a pre-funded payer
  // (required on devnet — the RPC faucet is closed).
  let payer: Keypair;
  const payerSecret = process.env.DEMO_PAYER_SECRET ?? '';
  if (payerSecret) {
    const bytes = payerSecret.startsWith('[')
      ? Uint8Array.from(JSON.parse(payerSecret))
      : (await import('bs58')).default.decode(payerSecret);
    payer = Keypair.fromSecretKey(bytes);
    console.error(`payer: ${payer.publicKey.toBase58()} (from DEMO_PAYER_SECRET)`);
  } else {
    payer = Keypair.generate();
    await airdrop(payer.publicKey, 0.5);
  }

  const mint = await createMint(conn, payer, payer.publicKey, null, DECIMALS);
  const payerAta = await getOrCreateAssociatedTokenAccount(conn, payer, mint, payer.publicKey);
  await getOrCreateAssociatedTokenAccount(conn, payer, mint, new PublicKey(PLATFORM_WALLET));
  await mintTo(conn, payer, mint, payerAta.address, payer, BigInt(100 * 10 ** DECIMALS));

  fs.mkdirSync(path.dirname(PAYER_FILE), { recursive: true });
  fs.writeFileSync(PAYER_FILE, JSON.stringify({
    payer: Array.from(payer.secretKey),
    mint: mint.toBase58(),
    payerAta: payerAta.address.toBase58(),
  }));

  // stdout carries only the mint — the runner exports it as SOLANA_USDC_MINT
  process.stdout.write(mint.toBase58());
}

main().catch(err => { console.error('create-mint failed:', err?.message ?? err); process.exit(1); });
