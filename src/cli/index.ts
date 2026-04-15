import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { handleToolCall } from '../server/tools';
import { logger } from '../utils/logger';

/**
 * Clawdrop CLI - Command-line interface for Clawdrop tools
 */

export async function main() {
  await yargs(hideBin(process.argv))
    .command(
      'list-tiers',
      'List all available Clawdrop tiers',
      (yargs) => yargs,
      async (argv) => {
        try {
          const result = await handleToolCall('list_tiers', {});
          const parsed = JSON.parse(result);
          console.log(JSON.stringify(parsed, null, 2));
        } catch (error) {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    )
    .command(
      'quote-tier',
      'Get a price quote for a tier',
      (yargs) => yargs
        .option('tier-id', {
          alias: 't',
          description: 'The tier ID to quote',
          type: 'string',
          demandOption: true,
        })
        .option('token', {
          description: 'Token to quote in (sol or herd)',
          type: 'string',
          default: 'sol',
          choices: ['sol', 'herd'],
        }),
      async (argv) => {
        try {
          const result = await handleToolCall('quote_tier', {
            tier_id: argv['tier-id'],
            token: argv.token,
          });
          const parsed = JSON.parse(result);
          console.log(JSON.stringify(parsed, null, 2));
        } catch (error) {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    )
    .command(
      'verify-payment',
      'Verify a Solana devnet transaction payment',
      (yargs) => yargs
        .option('payment-id', {
          alias: 'p',
          description: 'Payment ID to verify',
          type: 'string',
          demandOption: true,
        })
        .option('tx-hash', {
          alias: 'h',
          description: 'Solana transaction hash',
          type: 'string',
          demandOption: true,
        }),
      async (argv) => {
        try {
          const result = await handleToolCall('verify_payment', {
            payment_id: argv['payment-id'],
            tx_hash: argv['tx-hash'],
          });
          const parsed = JSON.parse(result);
          console.log(JSON.stringify(parsed, null, 2));
        } catch (error) {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    )
    .command(
      'deploy',
      'Deploy an OpenClaw instance',
      (yargs) => yargs
        .option('tier-id', {
          alias: 't',
          description: 'Tier ID to deploy',
          type: 'string',
          demandOption: true,
        })
        .option('payment-id', {
          alias: 'p',
          description: 'Payment ID that verified this deployment',
          type: 'string',
          demandOption: true,
        })
        .option('agent-name', {
          alias: 'n',
          description: 'Human-readable name for the agent',
          type: 'string',
          demandOption: true,
        })
        .option('wallet-address', {
          alias: 'w',
          description: 'Customer wallet address',
          type: 'string',
          demandOption: true,
        })
        .option('region', {
          alias: 'r',
          description: 'Hosting region',
          type: 'string',
          default: 'us-east',
        }),
      async (argv) => {
        try {
          const result = await handleToolCall('deploy_openclaw_instance', {
            tier_id: argv['tier-id'],
            payment_id: argv['payment-id'],
            agent_name: argv['agent-name'],
            wallet_address: argv['wallet-address'],
            region: argv.region,
          });
          const parsed = JSON.parse(result);
          console.log(JSON.stringify(parsed, null, 2));
        } catch (error) {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    )
    .command(
      'status',
      'Check deployment status',
      (yargs) => yargs
        .option('deployment-id', {
          alias: 'd',
          description: 'Deployment ID to check',
          type: 'string',
          demandOption: true,
        }),
      async (argv) => {
        try {
          const result = await handleToolCall('get_deployment_status', {
            deployment_id: argv['deployment-id'],
          });
          const parsed = JSON.parse(result);
          console.log(JSON.stringify(parsed, null, 2));
        } catch (error) {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    )
    .help()
    .alias('help', 'h')
    .demandCommand(1, 'You must provide a command')
    .strict()
    .parse();
}

// Run CLI if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error(error, 'CLI error');
    process.exit(1);
  });
}
