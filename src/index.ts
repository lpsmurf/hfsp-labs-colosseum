import { ClawdropMCPServer } from './server/mcp';
import { ClawdropAPIServer } from './server/api';
import { logger } from './utils/logger';

async function main() {
  try {
    // Check which mode to run
    const mode = process.env.CLAWDROP_MODE || 'mcp';
    
    if (mode === 'api' || mode === 'both') {
      // Start HTTP API server
      const apiPort = parseInt(process.env.API_PORT || '3000', 10);
      const apiServer = new ClawdropAPIServer(apiPort);
      await apiServer.start();
      logger.info({ port: apiPort }, 'API server started');
    }

    if (mode === 'mcp' || mode === 'both') {
      // Start MCP server (stdio - blocking)
      const server = new ClawdropMCPServer();
      await server.start();
      // MCP runs indefinitely on stdio
    }
  } catch (error) {
    logger.error(error, 'Failed to start Clawdrop server');
    process.exit(1);
  }
}

main();
