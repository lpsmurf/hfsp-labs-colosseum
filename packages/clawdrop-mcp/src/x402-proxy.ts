import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import logger from './utils/logger.js';

function resolveX402Path(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const req = createRequire(path.join(path.dirname(__filename), 'dummy.js'));
    return req.resolve('x402engine-mcp/dist/index.js');
  } catch {
    return 'x402engine-mcp';
  }
}

let _client: Client | null = null;
let _connectPromise: Promise<Client> | null = null;
let _cachedTools: Tool[] | null = null;

export async function getX402Client(): Promise<Client> {
  if (_client) return _client;
  if (_connectPromise) return _connectPromise;

  _connectPromise = (async () => {
    const x402Path = resolveX402Path();
    const isLocal = x402Path.endsWith('.js');

    const transport = new StdioClientTransport({
      command: isLocal ? 'node' : 'npx',
      args: isLocal ? [x402Path] : ['-y', 'x402engine-mcp'],
    });

    const client = new Client(
      { name: 'clawdrop-proxy', version: '1.0.0' },
      { capabilities: {} }
    );

    try {
      await client.connect(transport);
      logger.info('x402engine-mcp client connected');
      _client = client;
      return client;
    } catch (err) {
      logger.error({ err }, 'Failed to connect to x402engine-mcp');
      _connectPromise = null;
      throw err;
    }
  })();

  return _connectPromise;
}

export async function listX402Tools(): Promise<Tool[]> {
  if (_cachedTools) return _cachedTools;

  try {
    const client = await getX402Client();
    const result = await client.listTools();
    _cachedTools = result.tools;
    logger.info({ count: result.tools.length }, 'x402engine tools listed and cached');
    return result.tools;
  } catch (err) {
    logger.error({ err }, 'Failed to list x402engine tools');
    return [];
  }
}

export async function callX402Tool(name: string, args: Record<string, unknown>) {
  try {
    const client = await getX402Client();
    const result = await client.callTool({ name, arguments: args });
    logger.info({ tool: name }, 'x402engine tool called');
    return result;
  } catch (err) {
    logger.error({ err, tool: name }, 'Failed to call x402engine tool');
    throw err;
  }
}
