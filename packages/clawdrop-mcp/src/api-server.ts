import 'dotenv/config';
import { ClawdropAPIServer } from './server/api';
import logger from './utils/logger';

async function main() {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    const server = new ClawdropAPIServer(port);
    await server.start();
    logger.info({ port }, 'Clawdrop API server started');
  } catch (error) {
    logger.error(error, 'Failed to start Clawdrop API server');
    process.exit(1);
  }
}

main();
