#!/usr/bin/env node
/**
 * Clawdrop MCP Entry Point
 * Invoked by: claude mcp add clawdrop -- npx -y github:lpsmurf/hfsp-labs-colosseum
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, 'packages/clawdrop-mcp/dist/index.js');

const result = spawnSync(
  process.execPath,
  ['--experimental-specifier-resolution=node', serverPath, ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, CLAWDROP_MODE: 'mcp' } }
);
process.exit(result.status ?? 0);
