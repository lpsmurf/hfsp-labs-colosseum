import type { Database } from 'better-sqlite3';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { createHash } from 'node:crypto';
import { TokenType, SettlementMode } from '@oobe-protocol-labs/synapse-sap-sdk/types';
import { AGENT_DEFINITIONS, AGENT_BASE_URL, loadConfig } from '../config.js';
import { logAuditEvent, setAgentSapId } from '../db/migrations.js';
import type { AgentDefinition, SAPRegistrationResult } from '../types.js';

// HTTP method and tool category ordinals (mirrors on-chain u8 discriminants)
const HTTP = { Get: 0, Post: 1 };
const CAT  = { Data: 5, Analytics: 8, Custom: 9 };

// Tools to publish — one per service type offered by Clawdrop
const TOOLS_TO_PUBLISH = [
  { name: 'news-digest',         description: 'Daily crypto news digest',              method: HTTP.Get,  category: CAT.Data      },
  { name: 'prediction-markets',  description: 'Polymarket prediction market signals',  method: HTTP.Get,  category: CAT.Analytics },
  { name: 'trending-tokens',     description: 'Top trending tokens by 24h volume',     method: HTTP.Get,  category: CAT.Data      },
  { name: 'market-analysis',     description: 'AI-powered crypto market analysis',     method: HTTP.Get,  category: CAT.Analytics },
  { name: 'security-audit',      description: 'x402 repo security audit via x402',     method: HTTP.Post, category: CAT.Custom     },
] as const;

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

// ── Merchant readiness: stake + publish tools + inscribe schemas ─────────────
export interface MerchantInitResult {
  staked:       boolean;
  tools:        string[];
  schemas:      string[];
  capabilities: string[];
  errors:       string[];
}

export async function initializeMerchant(signer: unknown): Promise<MerchantInitResult> {
  if (!(signer instanceof Keypair)) throw new Error('Keypair required');

  const sdk    = await import('@oobe-protocol-labs/synapse-sap-sdk') as unknown as SapSdk;
  const config = loadConfig();
  const conn   = new Connection(config.solanaMainnetRpc, 'confirmed');
  const wallet = {
    publicKey: signer.publicKey,
    signTransaction: async (tx: unknown) => { (signer as unknown as { sign(tx: unknown): void }).sign(tx); return tx; },
    signAllTransactions: async (txs: unknown[]) => { txs.forEach(tx => (signer as unknown as { sign(tx: unknown): void }).sign(tx)); return txs; },
  };
  const client = new sdk.SapClient({ connection: conn, wallet, commitment: 'confirmed' });

  const [agentPda]  = sdk.Pdas.getAgentPDA(signer.publicKey);
  // IDL: stake seeds = ["sap_stake", agentPda] — SDK utility uses wallet which is wrong
  const PROGRAM_ID  = new PublicKey('SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ');
  const [stakePda]  = PublicKey.findProgramAddressSync(
    [Buffer.from('sap_stake'), agentPda.toBuffer()],
    PROGRAM_ID,
  );
  const [globalPda] = sdk.Pdas.getGlobalPDA();

  const result: MerchantInitResult = { staked: false, tools: [], schemas: [], capabilities: [], errors: [] };

  // ── 1. Stake ────────────────────────────────────────────────────────────────
  // 0.1 SOL = 100_000_000 lamports (OOBE explorer minimum)
  const STAKE_LAMPORTS = new BN(100_000_000);
  try {
    const stakeIx = await client.staking.initStake({
      signer,
      wallet: signer.publicKey,
      agent:  agentPda,
      stake:  stakePda,
      initialDeposit: STAKE_LAMPORTS,
    });
    const stakeTx = await client.buildTransaction([stakeIx], signer.publicKey);
    await client.sendTransaction(stakeTx, [signer]);
    result.staked = true;
    console.log('[merchant] stake initialised — 0.1 SOL');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already in use') || msg.includes('already exists')) {
      result.staked = true;
      console.log('[merchant] stake account already exists');
    } else {
      result.errors.push(`stake: ${msg.slice(0, 120)}`);
      console.warn('[merchant] stake failed:', msg.slice(0, 120));
    }
  }

  // ── 2. Publish tools ────────────────────────────────────────────────────────
  for (const tool of TOOLS_TO_PUBLISH) {
    const nameHash  = sha256Bytes(tool.name);
    // IDL: tool seeds = ["sap_tool", agentPda, toolNameHash] — SDK uses raw name, not hash
    const [toolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('sap_tool'), agentPda.toBuffer(), nameHash],
      PROGRAM_ID,
    );
    const protoHash = sha256Bytes('clawdrop');
    const descHash  = sha256Bytes(tool.description);
    const emptyHash = sha256Bytes('');

    try {
      const toolIx = await client.tools.publishTool({
        signer,
        wallet:          signer.publicKey,
        agent:           agentPda,
        tool:            toolPda,
        globalRegistry:  globalPda,
        toolName:        tool.name,
        toolNameHash:    Array.from(nameHash),
        protocolHash:    Array.from(protoHash),
        descriptionHash: Array.from(descHash),
        inputSchemaHash: Array.from(emptyHash),
        outputSchemaHash:Array.from(emptyHash),
        httpMethod:      tool.method,
        category:        tool.category,
        paramsCount:     0,
        requiredParams:  0,
        isCompound:      false,
      });
      const toolTx = await client.buildTransaction([toolIx], signer.publicKey);
      await client.sendTransaction(toolTx, [signer]);
      result.tools.push(tool.name);
      console.log(`[merchant] tool published: ${tool.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already in use') || msg.includes('already exists')) {
        result.tools.push(tool.name);
        console.log(`[merchant] tool already published: ${tool.name}`);
      } else {
        result.errors.push(`tool(${tool.name}): ${msg.slice(0, 120)}`);
        console.warn(`[merchant] tool publish failed (${tool.name}):`, msg.slice(0, 120));
      }
    }
  }

  // ── 3. Inscribe minimal JSON schema for each published tool ──────────────────
  for (const tool of TOOLS_TO_PUBLISH) {
    if (!result.tools.includes(tool.name)) continue; // skip if tool publish failed
    const nameHash2 = sha256Bytes(tool.name);
    const [toolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('sap_tool'), agentPda.toBuffer(), nameHash2],
      PROGRAM_ID,
    );
    const schema = JSON.stringify({ tool: tool.name, description: tool.description });
    const schemaBuf  = Buffer.from(schema, 'utf8');
    const schemaHash = Array.from(createHash('sha256').update(schemaBuf).digest());

    try {
      const schemaIx = await client.tools.inscribeToolSchema({
        signer,
        wallet: signer.publicKey,
        agent:  agentPda,
        tool:   toolPda,
        schemaType: 0,       // 0 = JSON
        schemaData: schemaBuf,
        schemaHash,
        compression: 0,      // 0 = none
      });
      const schemaTx = await client.buildTransaction([schemaIx], signer.publicKey);
      await client.sendTransaction(schemaTx, [signer]);
      result.schemas.push(tool.name);
      console.log(`[merchant] schema inscribed: ${tool.name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already in use') || msg.includes('already exists')) {
        result.schemas.push(tool.name);
      } else {
        result.errors.push(`schema(${tool.name}): ${msg.slice(0, 120)}`);
        console.warn(`[merchant] schema inscribe failed (${tool.name}):`, msg.slice(0, 120));
      }
    }
  }

  // ── 4. Register each capability in the global CapabilityIndex ───────────────
  // This is what populates explorer.oobeprotocol.ai/capabilities
  const allCaps = AGENT_DEFINITIONS.flatMap(a => a.capabilities);
  for (const capId of allCaps) {
    const capHash    = sha256Bytes(capId);
    const capHashArr = Array.from(capHash);
    // deriveCapabilityIndex seeds: ["sap_cap_idx", capabilityHash]
    const [capIndexPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('sap_cap_idx'), Buffer.from(capHash)],
      PROGRAM_ID,
    );

    try {
      const initIx = await (client as unknown as SapClientWithIndexing).indexing.initCapabilityIndex({
        signer,
        wallet:          signer.publicKey,
        agent:           agentPda,
        capabilityIndex: capIndexPda,
        globalRegistry:  globalPda,
        capabilityId:    capId,
        capabilityHash:  capHashArr,
      });
      const initTx = await client.buildTransaction([initIx], signer.publicKey);
      await client.sendTransaction(initTx, [signer]);

      const addIx = await (client as unknown as SapClientWithIndexing).indexing.addToCapabilityIndex({
        signer,
        wallet:          signer.publicKey,
        agent:           agentPda,
        capabilityIndex: capIndexPda,
        capabilityHash:  capHashArr,
      });
      const addTx = await client.buildTransaction([addIx], signer.publicKey);
      await client.sendTransaction(addTx, [signer]);

      result.capabilities.push(capId);
      console.log(`[merchant] capability indexed: ${capId}`);
      await sleep(2500); // avoid Synapse free-tier rate limit
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already in use') || msg.includes('already exists')) {
        // Already indexed — still add to the agent index entry
        try {
          const addIx = await (client as unknown as SapClientWithIndexing).indexing.addToCapabilityIndex({
            signer,
            wallet:          signer.publicKey,
            agent:           agentPda,
            capabilityIndex: capIndexPda,
            capabilityHash:  capHashArr,
          });
          const addTx = await client.buildTransaction([addIx], signer.publicKey);
          await client.sendTransaction(addTx, [signer]);
        } catch { /* already listed under this agent */ }
        result.capabilities.push(capId);
        console.log(`[merchant] capability already indexed: ${capId}`);
        await sleep(2500);
      } else {
        result.errors.push(`cap(${capId}): ${msg.slice(0, 300)}`);
        console.warn(`[merchant] capability index failed (${capId}):`, msg.slice(0, 100));
        await sleep(2500); // back off even on failure
      }
    }
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sha256Bytes(s: string): Uint8Array {
  return createHash('sha256').update(s, 'utf8').digest();
}

// ── v0.2.0 merchant minimum fix ──────────────────────────────────────────────
// Agents registered without a PricingTier fail the OOBE explorer merchant check.
// Call this to update an already-registered agent's pricing on-chain.
export async function updateAgentPricing(
  signer: unknown,
): Promise<{ sapId: string; explorerUrl: string } | null> {
  if (!(signer instanceof Keypair)) return null;

  const sdk = await import('@oobe-protocol-labs/synapse-sap-sdk') as unknown as SapSdk;
  const config = loadConfig();
  const connection = new Connection(config.solanaMainnetRpc, 'confirmed');

  const wallet = {
    publicKey: signer.publicKey,
    signTransaction: async (tx: unknown) => { (signer as unknown as { sign(tx: unknown): void }).sign(tx); return tx; },
    signAllTransactions: async (txs: unknown[]) => { txs.forEach(tx => (signer as unknown as { sign(tx: unknown): void }).sign(tx)); return txs; },
  };

  const client = new sdk.SapClient({ connection, wallet, commitment: 'confirmed' });
  const [agentPda] = sdk.Pdas.getAgentPDA(signer.publicKey);

  const pricing = [buildDefaultPricingTier()];

  // Include all capabilities from every agent definition so the explorer shows the full suite
  const allCaps = AGENT_DEFINITIONS.flatMap(a => a.capabilities).map(cap => ({
    id: cap,
    protocolId: cap.split(':')[0] ?? 'clawdrop',
    version: '1.0.0',
    description: null,
  }));

  const ix = await client.agent.updateAgent({
    signer,
    wallet: signer.publicKey,
    agent: agentPda,
    pricingMenu: agentPda, // pricing stored inline in AgentAccount; pricingMenu = same PDA
    name: null,
    description: null,
    capabilities: allCaps,
    pricing,
    protocols: null,
    agentId: null,
    agentUri: null,
    x402Endpoint: null,
  });

  const tx = await client.buildTransaction([ix], signer.publicKey);
  await client.sendTransaction(tx, [signer]);

  const sapId = agentPda.toBase58();
  return { sapId, explorerUrl: buildExplorerUrl(sapId) };
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
    signTransaction: async (tx: unknown) => { (signer as unknown as { sign(tx: unknown): void }).sign(tx); return tx; },
    signAllTransactions: async (txs: unknown[]) => { txs.forEach(tx => (signer as unknown as { sign(tx: unknown): void }).sign(tx)); return txs; },
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

  const pricing = [buildDefaultPricingTier()];

  const ix = await client.agent.registerAgent({
    name: agent.name,
    description: `Autonomous ${agent.service} agent — Clawdrop signal platform`,
    capabilities,
    pricing,
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

  try {
    const tx = await client.buildTransaction([ix], signer.publicKey);
    await client.sendTransaction(tx, [signer]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // "account already in use" = already registered — return the existing PDA
    if (msg.includes('already in use') || msg.includes('already exists')) {
      const sapId = agentPda.toBase58();
      return { sapId, explorerUrl: buildExplorerUrl(sapId), pending: false };
    }
    throw err;
  }

  const sapId = agentPda.toBase58();
  return { sapId, explorerUrl: buildExplorerUrl(sapId), pending: false };
}

function buildDefaultPricingTier(): unknown {
  // 0.01 USDC per call (6 decimals), x402 settlement — satisfies v0.2.0 merchant minimum
  // Anchor BorshCoder uses camelCase even though IDL declares snake_case
  return {
    tierId: 'standard',
    pricePerCall: new BN(10_000),     // 0.01 USDC
    minPricePerCall: null,
    maxPricePerCall: null,
    rateLimit: 60,
    maxCallsPerSession: 1000,
    burstLimit: 10,
    tokenType: TokenType.Usdc,
    tokenMint: null,
    tokenDecimals: 6,
    settlementMode: SettlementMode.X402,
    minEscrowDeposit: null,
    batchIntervalSec: null,
    volumeCurve: null,
  };
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
      updateAgent(ctx: Record<string, unknown>): Promise<unknown>;
    };
    staking: {
      initStake(ctx: Record<string, unknown>): Promise<unknown>;
      depositStake(ctx: Record<string, unknown>): Promise<unknown>;
    };
    tools: {
      publishTool(ctx: Record<string, unknown>): Promise<unknown>;
      inscribeToolSchema(ctx: Record<string, unknown>): Promise<unknown>;
    };
    buildTransaction(ixs: unknown[], payer: PublicKey): Promise<SapVersionedTx>;
    sendTransaction(tx: SapVersionedTx, signers: Keypair[]): Promise<string>;
  };
  Pdas: {
    getAgentPDA(wallet: PublicKey): [PublicKey, number];
    getAgentStatsPDA(agent: PublicKey): [PublicKey, number];
    getAgentStakePDA(wallet: PublicKey): [PublicKey, number];
    getToolPDA(agent: PublicKey, name: string): [PublicKey, number];
    getGlobalPDA(): [PublicKey, number];
  };
}

interface SapClientWithIndexing {
  indexing: {
    initCapabilityIndex(ctx: Record<string, unknown>): Promise<unknown>;
    addToCapabilityIndex(ctx: Record<string, unknown>): Promise<unknown>;
  };
}

interface SapVersionedTx {
  sign(signers: Keypair[]): void;
}
