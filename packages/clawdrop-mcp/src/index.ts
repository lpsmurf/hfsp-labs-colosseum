import 'dotenv/config';
import { ClawdropMCPServer } from './server/mcp';
import logger from './utils/logger';
import { startSubscriptionEnforcer } from './services/subscription-enforcer';

async function main() {
  try {
    const server = new ClawdropMCPServer();
    await server.start();

    // Start subscription enforcer (hourly checks, 48-hour grace period)
    const enforcerTimer = startSubscriptionEnforcer();
    logger.info('Subscription enforcer started (hourly checks)');

    // Graceful shutdown
    const shutdown = () => {
      clearInterval(enforcerTimer);
      logger.info('Subscription enforcer stopped');
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error(error, 'Failed to start Clawdrop MCP server');
    process.exit(1);
  }
}

main();
