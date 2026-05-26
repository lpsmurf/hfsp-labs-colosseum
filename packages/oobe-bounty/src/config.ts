import 'dotenv/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentDefinition, AgentId } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');

export const AGENT_BASE_URL = process.env.AGENT_BASE_URL ?? 'https://agents.clawdrop.live';
export const ACE_BASE_URL = process.env.ACEDATA_BASE_URL ?? 'https://api.acedata.cloud';

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: 'price-monitor',
    name: 'Clawdrop NewsBot',
    service: 'search',
    capabilities: ['news-search', 'headline-extraction', 'solana-intel'],
    endpoint: `${AGENT_BASE_URL}/news-monitor`,
    symbol: 'SOL',
  },
  {
    id: 'portfolio-analyzer',
    name: 'Clawdrop AnalystBot',
    service: 'chat',
    capabilities: ['market-analysis', 'ai-signals', 'coingecko-feeds'],
    endpoint: `${AGENT_BASE_URL}/analyst`,
    symbol: 'SOL',
  },
  {
    id: 'sentiment-monitor',
    name: 'Clawdrop ContentBot',
    service: 'images',
    capabilities: ['image-generation', 'signal-cards', 'news-visuals'],
    endpoint: `${AGENT_BASE_URL}/content`,
    symbol: 'SOL',
  },
];

export interface RuntimeConfig {
  port: number;
  databasePath: string;
  synapseRpcUrl: string;
  solanaMainnetRpc: string;
  aceDataApiKey: string;
  aceDataFacilitatorAddress: string;
  walletPublicKey: string;
  walletPrivateKey: string;
  agentIntervalMs: number;
  startAgents: boolean;
  nodeEnv: string;
}

export function loadConfig(): RuntimeConfig {
  const databasePath = process.env.DATABASE_PATH ?? './data/bounty-vault.db';

  return {
    port: parseInteger(process.env.PORT, 8788),
    databasePath: path.isAbsolute(databasePath)
      ? databasePath
      : path.resolve(packageRoot, databasePath),
    synapseRpcUrl: process.env.SYNAPSE_RPC_URL ?? 'https://synapse.oobeprotocol.ai',
    solanaMainnetRpc: process.env.SOLANA_MAINNET_RPC ?? 'https://api.mainnet-beta.solana.com',
    aceDataApiKey: process.env.ACEDATA_API_KEY ?? '',
    aceDataFacilitatorAddress: process.env.ACEDATA_FACILITATOR_ADDRESS ?? '',
    walletPublicKey: process.env.WALLET_PUBLIC_KEY ?? '',
    walletPrivateKey: process.env.WALLET_PRIVATE_KEY ?? '',
    agentIntervalMs: parseInteger(process.env.AGENT_INTERVAL_MS, 60 * 60 * 1000),
    startAgents: process.env.START_AGENTS !== 'false',
    nodeEnv: process.env.NODE_ENV ?? 'development',
  };
}

export function getAgentDefinition(agentId: AgentId): AgentDefinition {
  const agent = AGENT_DEFINITIONS.find((definition) => definition.id === agentId);
  if (!agent) {
    throw new Error(`Unknown agent id: ${agentId}`);
  }
  return agent;
}

export function missingRuntimeSecrets(config = loadConfig()): string[] {
  const required: Array<[keyof RuntimeConfig, string]> = [
    ['aceDataApiKey', 'ACEDATA_API_KEY'],
    ['aceDataFacilitatorAddress', 'ACEDATA_FACILITATOR_ADDRESS'],
    ['walletPublicKey', 'WALLET_PUBLIC_KEY'],
    ['walletPrivateKey', 'WALLET_PRIVATE_KEY'],
    ['solanaMainnetRpc', 'SOLANA_MAINNET_RPC'],
    ['synapseRpcUrl', 'SYNAPSE_RPC_URL'],
  ];

  return required
    .filter(([key]) => isPlaceholder(config[key]))
    .map(([, envName]) => envName);
}

export function envFileExists(): boolean {
  return existsSync(path.resolve(packageRoot, '.env'));
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isPlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.includes('your_') ||
    normalized.includes('<') ||
    normalized === 'undefined'
  );
}
