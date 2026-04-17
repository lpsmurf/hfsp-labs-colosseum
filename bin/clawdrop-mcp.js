#!/usr/bin/env node
// Launcher for Clawdrop MCP server
// Uses --experimental-specifier-resolution=node for ESM extensionless imports

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Re-launch self with the required Node.js flag
const args = process.execArgv;
if (!args.includes('--experimental-specifier-resolution=node')) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-specifier-resolution=node', join(__dirname, '../dist/index.js'), ...process.argv.slice(2)],
    { stdio: 'inherit' }
  );
  process.exit(result.status ?? 0);
} else {
  await import(join(__dirname, '../dist/index.js'));
}
