import type { Database } from 'better-sqlite3';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Keypair, PublicKey } from '@solana/web3.js';
import { AGENT_DEFINITIONS, loadConfig } from '../config.js';
import { logAuditEvent, setAgentSapId } from '../db/migrations.js';
import type { AgentDefinition, SAPAgent, SAPRegistrationResult } from '../types.js';

const require = createRequire(import.meta.url);

interface SapCapability {
  readonly id: string;
  readonly description: string | null;
  readonly protocolId: string | null;
  readonly version: string | null;
}

interface SapRegisterArgs {
  readonly name: string;
  readonly description: string;
  readonly capabilities: SapCapability[];
  readonly pricing: readonly [];
  readonly protocols: string[];
  readonly agentId: string;
  readonly agentUri: string;
  readonly x402Endpoint: string;
}

interface SapAgentModule {
  register(args: SapRegisterArgs): Promise<unknown>;
  fetch(wallet?: PublicKey): Promise<unknown>;
  deriveAgent(wallet?: PublicKey): readonly [PublicKey, number];
}

interface SapClient {
  readonly agent: SapAgentModule;
}

interface SapConnectionResult {
  readonly client: SapClient;
}

interface SapConnectionConstructor {
  fromKeypair(rpcUrl: string, keypair: Keypair): SapConnectionResult;
}

export async function registerAgentOnSAP(
  agent: AgentDefinition,
  signer: unknown,
  db?: Database,
): Promise<SAPRegistrationResult> {
  const config = loadConfig();

  try {
    const sdkResult = await tryRegisterWithSapSdk(agent, signer, config.synapseRpcUrl);
    if (sdkResult) {
      db && setAgentSapId(db, agent.id, sdkResult.sapId);
      db && logAuditEvent(db, agent.id, 'sap_register', {
        sapId: sdkResult.sapId,
        explorerUrl: sdkResult.explorerUrl,
        sdk: true,
      });
      return sdkResult;
    }
  } catch (error) {
    db && logAuditEvent(db, agent.id, 'sap_register_sdk_unavailable', {
      message: error instanceof Error ? error.message : 'SAP SDK registration failed',
    });
  }

  const fallback = buildPendingRegistration(agent);
  db && setAgentSapId(db, agent.id, fallback.sapId);
  db && logAuditEvent(db, agent.id, 'sap_register_pending', {
    sapId: fallback.sapId,
    explorerUrl: fallback.explorerUrl,
    reason: 'SAP SDK registration failed; using pending local registration',
  });

  return fallback;
}

export async function registerAllAgentsOnSAP(db: Database, signer: unknown): Promise<SAPRegistrationResult[]> {
  const results: SAPRegistrationResult[] = [];
  for (const agent of AGENT_DEFINITIONS) {
    results.push(await registerAgentOnSAP(agent, signer, db));
  }
  return results;
}

export async function discoverAgentsOnSAP(db?: Database): Promise<SAPAgent[]> {
  if (!db) {
    return AGENT_DEFINITIONS.map((agent) => ({
      ...agent,
      sapId: null,
      explorerUrl: null,
      running: false,
      lastSignalTime: null,
    }));
  }

  const rows = db.prepare(`
    SELECT id, sap_id, running, last_signal_time
    FROM agents
    ORDER BY id ASC
  `).all() as Array<{
    id: string;
    sap_id: string | null;
    running: number;
    last_signal_time: string | null;
  }>;

  return AGENT_DEFINITIONS.map((agent) => {
    const row = rows.find((candidate) => candidate.id === agent.id);
    return {
      ...agent,
      sapId: row?.sap_id ?? null,
      explorerUrl: row?.sap_id ? buildExplorerUrl(row.sap_id) : null,
      running: row?.running === 1,
      lastSignalTime: row?.last_signal_time ?? null,
    };
  });
}

async function tryRegisterWithSapSdk(
  agent: AgentDefinition,
  signer: unknown,
  synapseRpcUrl: string,
): Promise<SAPRegistrationResult | null> {
  if (!(signer instanceof Keypair)) {
    throw new Error('SAP registration requires a Solana Keypair signer');
  }

  const SapConnection = loadSapConnection();
  const { client } = SapConnection.fromKeypair(synapseRpcUrl, signer);

  await client.agent.register({
    name: agent.name,
    description: `Autonomous ${agent.service} agent for Solana signals`,
    capabilities: agent.capabilities.map((id) => ({
      id,
      description: null,
      protocolId: 'clawdrop',
      version: '1.0.0',
    })),
    pricing: [],
    protocols: ['clawdrop'],
    agentId: agent.id,
    agentUri: agent.endpoint,
    x402Endpoint: agent.endpoint,
  });

  await client.agent.fetch(signer.publicKey);
  const [agentPda] = client.agent.deriveAgent(signer.publicKey);
  const sapId = agentPda.toBase58();

  return {
    sapId,
    explorerUrl: buildExplorerUrl(sapId),
    pending: false,
  };
}

function loadSapConnection(): SapConnectionConstructor {
  // v0.17.0 documents SapConnection.fromKeypair, but its package exports omit
  // the core subpath. Resolve the installed package entry and load that SDK
  // module directly so registration still uses the real SDK implementation.
  const packageEntry = require.resolve('@oobe-protocol-labs/synapse-sap-sdk');
  const coreConnectionPath = path.join(path.dirname(packageEntry), 'core', 'connection.js');
  const loaded = require(coreConnectionPath) as unknown;

  if (!isRecord(loaded) || !isSapConnectionConstructor(loaded.SapConnection)) {
    throw new Error('Installed SAP SDK does not expose SapConnection.fromKeypair');
  }

  return loaded.SapConnection;
}

function buildPendingRegistration(agent: AgentDefinition): SAPRegistrationResult {
  const sapId = `sap_pending_${agent.id}`;
  return {
    sapId,
    explorerUrl: buildExplorerUrl(sapId),
    pending: true,
  };
}

function buildExplorerUrl(sapId: string): string {
  return `https://explorer.oobeprotocol.ai/agents/${encodeURIComponent(sapId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSapConnectionConstructor(value: unknown): value is SapConnectionConstructor {
  return isRecord(value) && typeof value.fromKeypair === 'function';
}
