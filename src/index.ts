import { ClawdropMCPServer } from './server/mcp';
import { logger } from './utils/logger';

async function main() {
  try {
    const server = new ClawdropMCPServer();
    await server.start();
  } catch (error) {
    logger.error(error, 'Failed to start Clawdrop MCP server');
    process.exit(1);
  }
}

main();
