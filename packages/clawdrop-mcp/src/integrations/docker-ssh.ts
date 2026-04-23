import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger';

const execAsync = promisify(exec);

/**
 * Direct Docker deployment via SSH — bypasses HFSP HTTP API entirely.
 * Used as primary deploy path for agents.
 * Handles bundle installation and environment variable configuration.
 *
 * Requires SSH key access to VPS_HOST.
 *
 * Deployment Flow:
 * 1. SSH to VPS, run docker pull (latest OpenClaw image)
 * 2. docker run with:
 *    - Agent metadata (agent_id, owner_wallet)
 *    - Installed bundles (solana, travel-crypto-pro, etc.)
 *    - Bundle-specific env vars (Amadeus keys, Gnosis Pay config, etc.)
 * 3. Container startup script:
 *    - npm install @clawdrop/mcp (always)
 *    - npm install @clawdrop/<bundle> for each active bundle
 *    - Start OpenClaw runtime
 * 4. OpenClaw loads MCP servers from installed packages
 * 5. Claude connects via MCP stdio protocol
 */

const TENANT_VPS_HOST = process.env.TENANT_VPS_HOST || '187.124.173.69'; // Tenant VPS;
const TENANT_VPS_USER = process.env.TENANT_VPS_USER || 'root';
const SSH_KEY = process.env.SSH_KEY_PATH || `${process.env.HOME}/.ssh/id_rsa`;
const OPENCLAW_IMAGE = process.env.OPENCLAW_IMAGE || 'ghcr.io/clawdrop/openclaw:latest';

// Map of bundle names to their npm package names
const BUNDLE_PACKAGES: Record<string, string> = {
  'solana': '@clawdrop/mcp',              // core wallet bundle
  'research': '@clawdrop/research',       // future
  'treasury': '@clawdrop/treasury',       // future
  'travel-crypto-pro': '@clawdrop/travel-crypto-pro',
};

// Map of bundles to required environment variables
const BUNDLE_ENV_VARS: Record<string, string[]> = {
  'travel-crypto-pro': [
    'AMADEUS_CLIENT_ID',
    'AMADEUS_CLIENT_SECRET',
    'AMADEUS_ENV',        // test or production
    'GNOSIS_PAY_API_KEY', // optional, defaults to sandbox
    'GNOSIS_PAY_API_URL',
    'GNOSIS_PAY_SANDBOX',
  ],
  'solana': [
    'SOLANA_RPC_URL',
    'HELIUS_API_KEY',
    'HELIUS_DEVNET_RPC',
  ],
};

const ssh = (cmd: string) =>
  execAsync(
    `ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${TENANT_VPS_USER}@${TENANT_VPS_HOST} "${cmd.replace(/"/g, '\\"')}"`,
    { timeout: 60_000 }
  );

export interface DockerDeployResult {
  container_id: string;
  agent_id: string;
  status: 'running' | 'error';
  vps_ip: string;
  error?: string;
}

export interface DockerStatusResult {
  agent_id: string;
  container_id?: string;
  status: 'running' | 'stopped' | 'not_found' | 'error';
  uptime_seconds?: number;
  error?: string;
}

/**
 * Collect environment variables needed for active bundles.
 * Returns both the vars that exist and logs missing ones.
 */
function getBundleEnvVars(bundles: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  const missing: string[] = [];

  for (const bundle of bundles) {
    const requiredVars = BUNDLE_ENV_VARS[bundle] || [];
    for (const varName of requiredVars) {
      const value = process.env[varName];
      if (value) {
        env[varName] = value;
      } else if (bundle === 'travel-crypto-pro' && varName === 'GNOSIS_PAY_SANDBOX') {
        // Default to sandbox mode if no API key
        env[varName] = 'true';
      } else if (bundle !== 'travel-crypto-pro' || varName !== 'GNOSIS_PAY_API_KEY') {
        // Optional for travel bundle, required for others
        if (bundle !== 'travel-crypto-pro' || varName !== 'GNOSIS_PAY_API_URL') {
          missing.push(`${bundle}:${varName}`);
        }
      }
    }
  }

  if (missing.length > 0) {
    logger.warn({ missing }, 'Some bundle environment variables are missing (may use defaults)');
  }

  return env;
}

/**
 * Generate npm install commands for bundles.
 * Installs @clawdrop/mcp (core wallet) + any additional bundles.
 */
function generateBundleInstalls(bundles: string[]): string {
  const packages = new Set<string>();

  // Always install core wallet MCP
  packages.add(BUNDLE_PACKAGES['solana']);

  // Add additional bundles
  for (const bundle of bundles) {
    const pkg = BUNDLE_PACKAGES[bundle];
    if (pkg && pkg !== BUNDLE_PACKAGES['solana']) {
      packages.add(pkg);
    }
  }

  // Generate install command
  // Use: npm install --save-prod <packages>
  // Or in container startup script that runs after npm init
  return Array.from(packages)
    .map(pkg => `npm install ${pkg}`)
    .join(' && ');
}

/**
 * Deploy an OpenClaw agent container directly via SSH + Docker.
 * No HFSP dependency — runs `docker run` on the VPS directly.
 *
 * Container will:
 * 1. Install @clawdrop/mcp (always)
 * 2. Install additional bundles (travel-crypto-pro, etc.)
 * 3. Start OpenClaw runtime
 * 4. Load MCP servers from installed packages
 */
export async function deployViaDocker(params: {
  agent_id: string;
  owner_wallet: string;
  bundles: string[];
  tier_id: string;
}): Promise<DockerDeployResult> {
  const { agent_id, owner_wallet, bundles, tier_id } = params;
  const containerName = `openclaw_${agent_id}`;
  const bundleStr = bundles.join(',');

  try {
    logger.info(
      { agent_id, tier_id, bundles },
      'Deploying agent via Docker SSH with bundle installation'
    );

    // Get bundle-specific env vars
    const bundleEnv = getBundleEnvVars(bundles);
    const bundleInstalls = generateBundleInstalls(bundles);

    // Pull latest image
    await ssh(`docker pull ${OPENCLAW_IMAGE} > /dev/null 2>&1 || true`);

    // Build environment variables for docker run
    // Always include:
    // - Agent metadata
    // - Installed bundles list
    // - Tier info
    // - Bundle-specific vars (Amadeus, Helius, etc.)
    // - Clawdrop control plane wallet info
    const envFlags = [
      `-e AGENT_ID=${agent_id}`,
      `-e OWNER_WALLET=${owner_wallet}`,
      `-e INSTALLED_BUNDLES=${bundleStr}`,
      `-e TIER_ID=${tier_id}`,
      `-e BUNDLE_INSTALLS="${bundleInstalls}"`,  // passed to startup script
      `-e ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY || ''}`,
      `-e SOLANA_RPC_URL=${process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'}`,
      `-e CLAWDROP_WALLET_ADDRESS=${process.env.CLAWDROP_WALLET_ADDRESS || ''}`,
    ];

    // Add bundle-specific env vars
    for (const [key, value] of Object.entries(bundleEnv)) {
      envFlags.push(`-e ${key}=${value}`);
    }

    // Docker labels for metadata
    const labels = [
      `-l clawdrop.agent_id=${agent_id}`,
      `-l clawdrop.owner_wallet=${owner_wallet}`,
      `-l clawdrop.tier=${tier_id}`,
      `-l clawdrop.bundles=${bundleStr}`,
      `-l clawdrop.deployed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)`,
    ];

    // Full docker run command
    const runCmd = [
      'docker run -d',
      `--name ${containerName}`,
      '--restart unless-stopped',
      '--log-driver=json-file',
      '--log-opt max-size=10m',
      '--log-opt max-file=5',
      ...envFlags,
      ...labels,
      '-v /var/log/agent_${agent_id}:/var/log/agent',  // volume for logs
      OPENCLAW_IMAGE,
      // When OpenClaw container starts, it should:
      // 1. Run "npm install" for all BUNDLE_INSTALLS
      // 2. Load MCP servers from installed packages
      // 3. Start stdio protocol server
    ].join(' ');

    const { stdout } = await ssh(runCmd);
    const container_id = stdout.trim().slice(0, 12);

    // Verify container is actually running (not just created)
    await new Promise(resolve => setTimeout(resolve, 2000));
    const status = await getDockerStatus(agent_id);

    if (status.status !== 'running') {
      logger.warn(
        { agent_id, container_id, status: status.status },
        'Container created but not yet running (may still be starting)'
      );
    }

    logger.info(
      { agent_id, container_id, vps_ip: TENANT_VPS_HOST, bundles, uptime_s: status.uptime_seconds },
      'Docker container deployed successfully'
    );

    return { container_id, agent_id, status: 'running', vps_ip: TENANT_VPS_HOST };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ agent_id, error: msg, bundles }, 'Docker deployment failed');
    return { container_id: '', agent_id, status: 'error', vps_ip: TENANT_VPS_HOST, error: msg };
  }
}

/**
 * Get container status for an agent via SSH.
 */
export async function getDockerStatus(agent_id: string): Promise<DockerStatusResult> {
  const containerName = `openclaw_${agent_id}`;
  try {
    const { stdout } = await ssh(
      `docker inspect --format '{{.State.Status}} {{.State.StartedAt}}' ${containerName} 2>/dev/null || echo not_found`
    );
    const [state, startedAt] = stdout.trim().split(' ');

    if (state === 'not_found' || !state) {
      return { agent_id, status: 'not_found' };
    }

    const uptimeSeconds = startedAt
      ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
      : 0;

    return {
      agent_id,
      status: state === 'running' ? 'running' : 'stopped',
      uptime_seconds: uptimeSeconds,
    };
  } catch (err) {
    return { agent_id, status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get container logs (for debugging).
 */
export async function getDockerLogs(agent_id: string, lines: number = 100): Promise<string> {
  const containerName = `openclaw_${agent_id}`;
  try {
    const { stdout } = await ssh(`docker logs --tail ${lines} ${containerName} 2>&1 || echo "Container not found"`);
    return stdout;
  } catch (err) {
    return `Error fetching logs: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Stop and remove a container via SSH.
 */
export async function removeDockerContainer(agent_id: string): Promise<boolean> {
  const containerName = `openclaw_${agent_id}`;
  try {
    await ssh(`docker rm -f ${containerName} 2>/dev/null || true`);
    logger.info({ agent_id }, 'Container removed');
    return true;
  } catch (err) {
    logger.error({ agent_id, error: err }, 'Failed to remove container');
    return false;
  }
}

/**
 * SSH connectivity check — used to verify VPS is reachable before deploying.
 * Also checks Docker is available.
 */
export async function checkSSHConnectivity(): Promise<boolean> {
  try {
    const { stdout } = await ssh('docker --version');
    const hasDocker = stdout.includes('Docker');
    if (!hasDocker) {
      logger.warn('Docker not available on VPS');
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ error: err }, 'SSH or Docker connectivity check failed');
    return false;
  }
}
