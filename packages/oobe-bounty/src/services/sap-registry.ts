import type { Database } from 'better-sqlite3';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AGENT_DEFINITIONS, AGENT_BASE_URL, loadConfig } from '../config.js';
import { logAuditEvent, setAgentSapId } from '../db/migrations.js';
import type { AgentDefinition, SAPRegistrationResult } from '../types.js';

export async function registerAgentOnSAP(
  agent: AgentDefinition,
  signer: unknown,
  db?: Database,
): Promise<SAPRegistrationResult> {
  const config = loadConfig();

  try {
    const result = await tryRegisterWithSapSdk(agent, signer, config.synapseRpcUrl);
    if (result) {
      db && setAgentSapId(db, agent.id, result.sapId);
      db && logAuditEvent(db, agent.id, 'sap_register', {
        sapId: result.sapId,
        explorerUrl: result.explorerUrl,
      });
      return result;
    }
  } catch (error) {
    db && logAuditEvent(db, agent.id, 'sap_register_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const fallback = buildPendingRegistration(agent);
  db && setAgentSapId(db, agent.id, fallback.sapId);
  db && logAuditEvent(db, agent.id, 'sap_register_pending', {
    sapId: fallback.sapId,
    reason: 'SAP SDK registration failed — using pending',
  });
  return fallback;
}

// One wallet = one SAP Agent PDA. We register one combined agent for the whole suite.
// All individual agents share the same on-chain identity.
export async function registerAllAgentsOnSAP(
  db: Database,
  signer: unknown,
): Promise<SAPRegistrationResult[]> {
  // Derive the PDA first — if already registered, just record it without re-submitting
  const existingSapId = await getExistingSapId(signer);
  if (existingSapId) {
    const result: SAPRegistrationResult = { sapId: existingSapId, explorerUrl: buildExplorerUrl(existingSapId), pending: false };
    for (const agent of AGENT_DEFINITIONS) {
      setAgentSapId(db, agent.id, existingSapId);
    }
    return AGENT_DEFINITIONS.map(() => result);
  }

  // First registration — register once with all capabilities combined
  const suiteAgent = {
    id: 'clawdrop-signal-suite' as const,
    name: 'Clawdrop Signal Suite',
    service: 'search' as const,
    capabilities: AGENT_DEFINITIONS.flatMap(a => a.capabilities),
    endpoint: AGENT_BASE_URL,
    symbol: 'MULTI',
  };

  const result = await registerAgentOnSAP(suiteAgent as unknown as AgentDefinition, signer, db);
  const results = AGENT_DEFINITIONS.map(() => result);
  for (const agent of AGENT_DEFINITIONS) {
    setAgentSapId(db, agent.id, result.sapId);
  }
  return results;
}

async function getExistingSapId(signer: unknown): Promise<string | null> {
  try {
    if (!(signer instanceof Keypair)) return null;
    const sdk = await import('@oobe-protocol-labs/synapse-sap-sdk') as unknown as SapSdk;
    const [agentPda] = sdk.Pdas.getAgentPDA(signer.publicKey);
    return agentPda.toBase58();
  } catch { return null; }
}

export async function discoverAgentsOnSAP(db?: Database) {
  if (!db) return AGENT_DEFINITIONS.map(a => ({ ...a, sapId: null, explorerUrl: null, running: false, lastSignalTime: null }));
  const rows = db.prepare(`SELECT id, sap_id, running, last_signal_time FROM agents ORDER BY id ASC`).all() as Array<{ id: string; sap_id: string | null; running: number; last_signal_time: string | null }>;
  return AGENT_DEFINITIONS.map(agent => {
    const row = rows.find(r => r.id === agent.id);
    return { ...agent, sapId: row?.sap_id ?? null, explorerUrl: row?.sap_id ? buildExplorerUrl(row.sap_id) : null, running: row?.running === 1, lastSignalTime: row?.last_signal_time ?? null };
  });
}

async function tryRegisterWithSapSdk(
  agent: AgentDefinition,
  signer: unknown,
  rpcUrl: string,
): Promise<SAPRegistrationResult | null> {
  if (!(signer instanceof Keypair)) throw new Error('SAP registration requires a Solana Keypair');

  const sdk = await import('@oobe-protocol-labs/synapse-sap-sdk') as unknown as SapSdk;

  // Synapse RPC doesn't serve standard JSON-RPC — use Helius mainnet for transaction submission
  const config = loadConfig();
  const rpcEndpoint = config.solanaMainnetRpc.includes('helius')
    ? config.solanaMainnetRpc
    : config.solanaMainnetRpc;
  const connection = new Connection(rpcEndpoint, 'confirmed');

  // Minimal wallet adapter for Anchor
  const wallet = {
    publicKey: signer.publicKey,
    signTransaction: async (tx: Parameters<typeof signer.sign>[0]) => { signer.sign(tx); return tx; },
    signAllTransactions: async (txs: Parameters<typeof signer.sign>[0][]) => { txs.forEach(tx => signer.sign(tx)); return txs; },
  };

  const client = new sdk.SapClient({ connection, wallet, commitment: 'confirmed' });

  // Derive PDAs
  const [agentPda]      = sdk.Pdas.getAgentPDA(signer.publicKey);
  const [agentStatsPda] = sdk.Pdas.getAgentStatsPDA(agentPda);
  const [globalPda]     = sdk.Pdas.getGlobalPDA();

  // Capability IDs already in protocol:action format from AGENT_DEFINITIONS
  const capabilities = agent.capabilities.map(cap => ({
    id: cap,
    protocolId: cap.split(':')[0] ?? 'clawdrop',
    version: '1.0.0',
    description: null,
  }));

  const ix = await client.agent.registerAgent({
    name: agent.name,
    description: `Autonomous ${agent.service} agent — Clawdrop signal platform`,
    capabilities,
    pricing: [],
    protocols: ['clawdrop', 'x402'],
    agentId: agent.id,
    agentUri: agent.endpoint,
    x402Endpoint: agent.endpoint,
    wallet: signer.publicKey,
    agent: agentPda,
    agentStats: agentStatsPda,
    globalRegistry: globalPda,
    signer,
  });

  const tx = await client.buildTransaction([ix], signer.publicKey);
  await client.sendTransaction(tx, [signer]);

  const sapId = agentPda.toBase58();
  return { sapId, explorerUrl: buildExplorerUrl(sapId), pending: false };
}

function buildPendingRegistration(agent: AgentDefinition): SAPRegistrationResult {
  const sapId = `sap_pending_${agent.id}`;
  return { sapId, explorerUrl: buildExplorerUrl(sapId), pending: true };
}

function buildExplorerUrl(sapId: string): string {
  return `https://explorer.oobeprotocol.ai/agents/${encodeURIComponent(sapId)}`;
}

// Minimal SDK type surface we need
interface SapSdk {
  SapClient: new (opts: { connection: Connection; wallet: unknown; commitment: string }) => {
    agent: {
      registerAgent(ctx: Record<string, unknown>): Promise<unknown>;
    };
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
