/**
 * Register the audit service in the ERC-8004 Identity Registry on Celo.
 *
 * Dry run by default: prints the registration file and the transactions it would
 * send. Nothing is broadcast without --send, because a mainnet registration is a
 * public, permanent record.
 *
 *   CELO_AGENT_PRIVATE_KEY=0x… npx tsx scripts/celo-register-agent.ts \
 *     [--network celo|celoSepolia] [--endpoint https://audit.hfsp.cloud] [--send]
 *
 * Two transactions: register() mints the agentId, then setAgentURI() rewrites the
 * file to include its own `registrations` entry — the spec wants that entry and
 * the id does not exist until the mint.
 *
 * The file is stored fully on-chain as a data: URI, so there is nothing to host
 * and nothing that can 404 at judging time.
 */

import { ethers } from 'ethers';

const NETWORKS = {
  celo:        { chainId: 42220,    rpc: 'https://forno.celo.org',                     registry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', explorer: 'https://celoscan.io' },
  celoSepolia: { chainId: 11142220, rpc: 'https://forno.celo-sepolia.celo-testnet.org', registry: '0x8004A818BFB912233c491871b3d84c89A494BD9e', explorer: 'https://celo-sepolia.blockscout.com' },
} as const;

const ABI = [
  'function register(string agentURI) returns (uint256 agentId)',
  'function setAgentURI(uint256 agentId, string newURI)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
];

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const networkName = arg('network', 'celoSepolia') as keyof typeof NETWORKS;
const endpoint    = arg('endpoint', 'https://audit.hfsp.cloud').replace(/\/$/, '');
const commerceBase = arg('commerce-base', 'https://store.hfsp.cloud').replace(/\/$/, '');
// Update an existing agent's URI instead of registering a new one (one tx).
const updateId    = arg('agent-id', '');
const send        = process.argv.includes('--send');
const net = NETWORKS[networkName];
if (!net) throw new Error(`--network must be one of ${Object.keys(NETWORKS).join(', ')}`);

const key = process.env.CELO_AGENT_PRIVATE_KEY;
if (!key) throw new Error('Set CELO_AGENT_PRIVATE_KEY (the wallet that will own the agent NFT)');

const provider = new ethers.JsonRpcProvider(net.rpc, net.chainId);
const wallet   = new ethers.Wallet(key, provider);
const registry = new ethers.Contract(net.registry, ABI, wallet);

// --profile commerce registers the hackathon project; the default stays the audit service.
// Only list services that resolve today — setAgentURI can add endpoints once they are live.
const PROFILES = {
  audit: {
    name: 'HFSP x402 Security Auditor',
    description:
      'Security audits for x402 payment services, paid per call over x402. Pay $0.99 USDC on ' +
      'Celo, Base or Solana; POST a public GitHub repo (and optionally a live endpoint) and get ' +
      'static + dynamic findings: payment-bypass, replay, CORS, exposed secrets, access control.',
    image: `${endpoint}/favicon.png`,
    services: [
      { name: 'web',  endpoint: `${endpoint}/` },
      { name: 'A2A',  endpoint: `${endpoint}/.well-known/agent-card.json`, version: '0.3.0' },
      { name: 'email', endpoint: 'info@hfsp.xyz' },
    ],
  },
  commerce: {
    name: 'Celo Agent Commerce',
    description:
      'x402 payment rails on Celo for mobile airtime, data bundles, gift cards and eSIMs — ' +
      'callable by any agent, bot or app with one HTTP request. Settles in USDT, USAT or USDC ' +
      'through the Celo x402 facilitator; integrators earn a revenue share on independent buyers.',
    image: 'https://github.com/lpsmurf.png',
    // Only endpoints that resolve today. The store base is the x402 resource; the
    // MCP server and OpenAPI spec make it discoverable to agents and tooling.
    services: [
      { name: 'x402',    endpoint: `${commerceBase}/api/celo/orders` },
      { name: 'mcp',     endpoint: `${commerceBase}/mcp` },
      { name: 'openapi', endpoint: `${commerceBase}/openapi.json` },
      { name: 'checkout', endpoint: `${commerceBase}/checkout` },
      { name: 'web',     endpoint: 'https://github.com/lpsmurf/celo-agent-commerce' },
      { name: 'email',   endpoint: 'info@hfsp.xyz' },
    ],
  },
} as const;
const profileName = arg('profile', 'audit') as keyof typeof PROFILES;
const profile = PROFILES[profileName];
if (!profile) throw new Error(`--profile must be one of ${Object.keys(PROFILES).join(', ')}`);

function registrationFile(agentId?: bigint) {
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    ...profile,
    x402Support: true,
    active: true,
    registrations: agentId === undefined ? [] : [
      { agentId: Number(agentId), agentRegistry: `eip155:${net.chainId}:${net.registry}` },
    ],
    supportedTrust: ['reputation'],
  };
}

const toDataUri = (o: unknown) =>
  `data:application/json;base64,${Buffer.from(JSON.stringify(o)).toString('base64')}`;

console.log(`network   ${networkName} (${net.chainId})`);
console.log(`registry  ${net.registry}`);
console.log(`owner     ${wallet.address}`);
console.log(`balance   ${ethers.formatEther(await provider.getBalance(wallet.address))} CELO`);
// Updating an existing agent: one setAgentURI tx, no mint. The file already
// carries this id's registrations entry.
if (updateId) {
  const agentId = BigInt(updateId);
  console.log(`update    agentId ${agentId} (setAgentURI only)`);
  console.log('file      ', JSON.stringify(registrationFile(agentId), null, 2));
  if (!send) { console.log('\nDry run. Re-run with --send to update (1 transaction).'); process.exit(0); }
  const tx = await registry.setAgentURI(agentId, toDataUri(registrationFile(agentId)));
  console.log(`setURI    ${net.explorer}/tx/${tx.hash}`);
  await tx.wait();
  console.log(`\nDone. Updated agentId ${agentId} on eip155:${net.chainId}:${net.registry}`);
  process.exit(0);
}

console.log('file      ', JSON.stringify(registrationFile(0n), null, 2));

if (!send) {
  console.log('\nDry run. Re-run with --send to register (2 transactions).');
  process.exit(0);
}

const tx1 = await registry.register(toDataUri(registrationFile()));
console.log(`register  ${net.explorer}/tx/${tx1.hash}`);
const r1 = await tx1.wait();
const log = r1!.logs.map((l: ethers.Log) => { try { return registry.interface.parseLog(l); } catch { return null; } })
  .find((p: ethers.LogDescription | null) => p?.name === 'Registered');
if (!log) throw new Error('No Registered event in receipt — check the tx on the explorer');
const agentId = log.args.agentId as bigint;
console.log(`agentId   ${agentId}`);

const tx2 = await registry.setAgentURI(agentId, toDataUri(registrationFile(agentId)));
console.log(`setURI    ${net.explorer}/tx/${tx2.hash}`);
await tx2.wait();

console.log(`\nDone. agentRegistry eip155:${net.chainId}:${net.registry}  agentId ${agentId}`);
