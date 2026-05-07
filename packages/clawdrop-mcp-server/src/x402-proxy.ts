import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

function resolveX402Path(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('module');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const req = m.createRequire(process.cwd() + '/package.json');
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

    await client.connect(transport);
    console.log('[x402-proxy] x402engine-mcp client connected');
    _client = client;
    return client;
  })();

  return _connectPromise;
}

export async function listX402Tools(): Promise<Tool[]> {
  if (_cachedTools) return _cachedTools;

  try {
    const client = await getX402Client();
    const result = await client.listTools();
    _cachedTools = result.tools;
    console.log(`[x402-proxy] ${result.tools.length} x402engine tools listed and cached`);
    return result.tools;
  } catch (err) {
    console.error('[x402-proxy] Failed to list x402engine tools:', (err as Error).message);
    return [];
  }
}

export async function callX402Tool(name: string, args: Record<string, unknown>) {
  try {
    const client = await getX402Client();
    const result = await client.callTool({ name, arguments: args });
    console.log(`[x402-proxy] x402engine tool called: ${name}`);
    return result;
  } catch (err) {
    console.error(`[x402-proxy] Failed to call x402engine tool ${name}:`, (err as Error).message);
    throw err;
  }
}
