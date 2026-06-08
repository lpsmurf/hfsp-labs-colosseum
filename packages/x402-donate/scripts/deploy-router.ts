/**
 * Deploy DonationRouter to Base mainnet (or Base Sepolia for testing).
 *
 * Usage:
 *   npx tsx scripts/deploy-router.ts
 *
 * Required env vars (same .env as the server):
 *   ROUTER_PRIVATE_KEY   — deployer + router EOA (same key used by the server)
 *   TREASURY_ADDRESS     — wallet that receives the 3% fee
 *   BASE_RPC_URL         — Base mainnet or Sepolia RPC
 *
 * After deployment, set ROUTER_CONTRACT_ADDRESS in .env to the printed address.
 */
import 'dotenv/config';
import { ethers } from 'ethers';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

const rpcUrl       = process.env.BASE_RPC_URL ?? 'https://mainnet.base.org';
const privateKey   = process.env.ROUTER_PRIVATE_KEY;
const treasury     = process.env.TREASURY_ADDRESS;

if (!privateKey || !treasury) {
  console.error('Missing ROUTER_PRIVATE_KEY or TREASURY_ADDRESS in .env');
  process.exit(1);
}

const isTestnet = rpcUrl.includes('sepolia');
const usdcAddr  = isTestnet ? BASE_SEPOLIA_USDC : BASE_USDC;

console.log(`Deploying DonationRouter to ${isTestnet ? 'Base Sepolia' : 'Base mainnet'}`);
console.log(`  USDC:     ${usdcAddr}`);
console.log(`  Treasury: ${treasury}`);

const provider = new ethers.JsonRpcProvider(rpcUrl);
const deployer  = new ethers.Wallet(privateKey, provider);

console.log(`  Deployer/Router EOA: ${deployer.address}`);

// Load compiled bytecode — compile with: npx solc --bin --abi contracts/DonationRouter.sol
const artifactPath = join(__dir, '../src/abi/DonationRouter.json');
const artifact = require(artifactPath) as { abi: ethers.InterfaceAbi; bytecode?: string };

if (!artifact.bytecode) {
  // Read companion .bin if abi-only JSON provided
  const binPath = join(__dir, '../contracts/DonationRouter.bin');
  try {
    (artifact as { bytecode?: string }).bytecode = readFileSync(binPath, 'utf8').trim();
  } catch {
    console.error('No bytecode found. Compile first: npx solc --bin --abi contracts/DonationRouter.sol -o build/');
    process.exit(1);
  }
}

const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode!, deployer);

const contract = await factory.deploy(usdcAddr, treasury, deployer.address);
console.log(`\nDeploying... tx: ${contract.deploymentTransaction()?.hash}`);
await contract.waitForDeployment();

const address = await contract.getAddress();
console.log(`\nDonationRouter deployed at: ${address}`);
console.log(`\nAdd to .env:`);
console.log(`ROUTER_CONTRACT_ADDRESS=${address}`);
console.log(`\nVerify on Basescan:`);
console.log(`https://${isTestnet ? 'sepolia.' : ''}basescan.org/address/${address}`);
