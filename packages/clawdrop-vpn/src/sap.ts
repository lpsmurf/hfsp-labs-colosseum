import { Connection, Keypair, PublicKey } from '@solana/web3.js';

const HELIUS_KEY = process.env.HELIUS_API_KEY ?? '';
const SYNAPSE_RPC = process.env.SYNAPSE_RPC_URL ?? (HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : 'https://api.mainnet-beta.solana.com');
const AGENT_BASE_URL = process.env.AGENT_BASE_URL ?? 'https://vpn.clawdrop.live';

export async function registerOnSAP(privateKeyHex: string): Promise<string | null> {
  if (!privateKeyHex) {
    console.warn('[sap] No WALLET_PRIVATE_KEY_HEX — skipping SAP registration');
    return null;
  }

  try {
    const signer = Keypair.fromSecretKey(Buffer.from(privateKeyHex.replace(/^0x/, ''), 'hex'));
    const sdk = await import('@oobe-protocol-labs/synapse-sap-sdk') as unknown as SapSdk;
    const connection = new Connection(SYNAPSE_RPC, 'confirmed');
    const client = new sdk.SapClient({ connection, wallet: signer, commitment: 'confirmed' });

    const [agentPda] = sdk.Pdas.getAgentPDA(signer.publicKey);
    const [agentStatsPda] = sdk.Pdas.getAgentStatsPDA(agentPda);
    const [globalPda] = sdk.Pdas.getGlobalPDA();
    const sapId = agentPda.toBase58();

    // If already registered, skip re-submission
    const existing = await connection.getAccountInfo(agentPda);
    if (existing) {
      console.log(`[sap] Already registered: ${sapId}`);
      console.log(`[sap] Explorer: https://explorer.oobeprotocol.ai/agents/${sapId}`);
      return sapId;
    }

    const ix = await client.agent.registerAgent({
      name: 'Clawdrop VPN',
      description: 'x402-gated anonymous HTTP proxy. Pay USDC on Solana → get a time-limited CONNECT proxy session. No account, no logs. Tiers: 0.10 USDC/1h, 0.50 USDC/6h, 1.50 USDC/24h.',
      capabilities: ['clawdrop:vpn-proxy', 'clawdrop:private-proxy', 'clawdrop:x402-vpn', 'clawdrop:anonymous-browsing'],
      pricing: [],
      protocols: ['x402', 'http-connect'],
      agentId: 'clawdrop-vpn',
      agentUri: AGENT_BASE_URL,
      x402Endpoint: `${AGENT_BASE_URL}/session`,
      wallet: signer.publicKey,
      agent: agentPda,
      agentStats: agentStatsPda,
      globalRegistry: globalPda,
      signer,
    });

    const tx = await client.buildTransaction([ix], signer.publicKey);
    const txSig = await client.sendTransaction(tx, [signer]);

    console.log(`[sap] Registered Clawdrop VPN: ${sapId}`);
    console.log(`[sap] Explorer: https://explorer.oobeprotocol.ai/agents/${sapId}`);
    console.log(`[sap] Tx: ${txSig}`);
    return sapId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already in use') || msg.includes('already exists')) {
      console.log('[sap] Already registered on SAP');
    } else {
      console.warn('[sap] Registration failed (non-fatal):', msg.slice(0, 300));
    }
    return null;
  }
}

interface SapSdk {
  SapClient: new (opts: { connection: Connection; wallet: unknown; commitment: string }) => {
    agent: { registerAgent(ctx: Record<string, unknown>): Promise<unknown> };
    buildTransaction(ixs: unknown[], payer: PublicKey): Promise<SapVersionedTx>;
    sendTransaction(tx: SapVersionedTx, signers: Keypair[]): Promise<string>;
  };
  Pdas: {
    getAgentPDA(wallet: PublicKey): [PublicKey, number];
    getAgentStatsPDA(agent: PublicKey): [PublicKey, number];
    getGlobalPDA(): [PublicKey, number];
  };
}

interface SapVersionedTx {
  sign(signers: Keypair[]): void;
}
