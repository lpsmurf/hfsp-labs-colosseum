import 'dotenv/config';
import { startDistributionService, stopDistributionService } from './index.js';

console.log('[Clawdrop] Starting production distribution service...');
await startDistributionService();

const shutdown = () => {
  console.log('[Clawdrop] Shutting down distribution service...');
  stopDistributionService();
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

// Keep alive
await new Promise(() => {});
