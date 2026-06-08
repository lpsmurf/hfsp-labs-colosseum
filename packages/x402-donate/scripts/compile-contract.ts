/**
 * Compile DonationRouter.sol and write bytecode + ABI into src/abi/DonationRouter.json
 * Usage: npx tsx scripts/compile-contract.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __dir  = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const solc    = require('solc') as { compile: (i: string) => string };

const contractPath = join(__dir, '../contracts/DonationRouter.sol');
const source       = readFileSync(contractPath, 'utf8');

const input = JSON.stringify({
  language: 'Solidity',
  sources: { 'DonationRouter.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
  },
});

const output = JSON.parse(solc.compile(input)) as {
  errors?: Array<{ severity: string; formattedMessage: string }>;
  contracts?: { [file: string]: { [name: string]: { abi: unknown[]; evm: { bytecode: { object: string } } } } };
};

const errors = (output.errors ?? []).filter(e => e.severity === 'error');
if (errors.length > 0) {
  errors.forEach(e => console.error(e.formattedMessage));
  process.exit(1);
}

const warnings = (output.errors ?? []).filter(e => e.severity === 'warning');
warnings.forEach(w => console.warn(w.formattedMessage));

const contract  = output.contracts?.['DonationRouter.sol']?.['DonationRouter'];
if (!contract) { console.error('Compilation produced no output'); process.exit(1); }

const artifact = {
  contractName: 'DonationRouter',
  abi:          contract.abi,
  bytecode:     '0x' + contract.evm.bytecode.object,
};

const outPath = join(__dir, '../src/abi/DonationRouter.json');
writeFileSync(outPath, JSON.stringify(artifact, null, 2));
console.log(`Compiled DonationRouter → ${outPath}`);
console.log(`Bytecode size: ${contract.evm.bytecode.object.length / 2} bytes`);
