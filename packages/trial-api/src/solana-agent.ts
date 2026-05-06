import { SolanaAgentKit, KeypairWallet } from 'solana-agent-kit';
import TokenPlugin from '@solana-agent-kit/plugin-token';
import { Keypair } from '@solana/web3.js';

// Read-only agent — no real wallet needed for balance/price queries
// Use a throwaway keypair; private key is never used for signing in trial mode
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const keypair = Keypair.generate();
const wallet = new KeypairWallet(keypair, RPC_URL);

// Only load TokenPlugin — plugin-misc has an ESM/anchor incompatibility
// CoinGecko price tools keep their custom implementations (no Agent Kit needed)
const solanaAgent: any = new SolanaAgentKit(
  wallet,
  RPC_URL,
  {
    HELIUS_API_KEY: process.env.HELIUS_API_KEY ?? '',
  }
).use(TokenPlugin);
