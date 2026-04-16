import { execFileSync } from 'child_process';
import { BaseProvisioner, ProvisioningConfig, ProvisioningResult, ProvisionerConfig } from './types';

/**
 * Resource limits per container tier
 */
const RESOURCE_LIMITS = {
  // KVM 4 tier: 4 vCPU, 16GB RAM
  'kvm-4': {
    maxContainers: 6,
    memory: '1.5g',
    memorySwap: '1.5g',
    cpus: '0.5',
    pidsLimit: 100,
  },
  // KVM 8 tier: 8 vCPU, 32GB RAM
  'kvm-8': {
    maxContainers: 16,
    memory: '1.5g',
    memorySwap: '1.5g',
    cpus: '0.5',
    pidsLimit: 100,
  },
} as const;

// Default to KVM 4 limits if tier not specified
const DEFAULT_TIER = 'kvm-4';

/**
 * ShellProvisioner: Single VPS provisioning via SSH + Docker
 * Extracts current bot provisioning logic into a reusable class
 */
export class ShellProvisioner extends BaseProvisioner {
  private vpsHost: string;
  private vpsUser: string;
  private sshOpts: string[];
  private tier: keyof typeof RESOURCE_LIMITS;

  constructor(
    config: ProvisionerConfig,
    vpsHost: string = '187.124.173.69',
    vpsUser: string = 'root',
    tier: keyof typeof RESOURCE_LIMITS = DEFAULT_TIER
  ) {
    super(config);
    this.vpsHost = vpsHost;
    this.vpsUser = vpsUser;
    this.tier = tier in RESOURCE_LIMITS ? tier : DEFAULT_TIER;
    this.sshOpts = ['-i', config.sshKey, '-o', 'StrictHostKeyChecking=accept-new'];
  }

  /**
   * Execute SSH command on tenant VPS
   */
  private sshTenant(command: string): string {
    return execFileSync(
      'ssh',
      [...this.sshOpts, `${this.vpsUser}@${this.vpsHost}`, command],
      { encoding: 'utf8' }
    ).trim();
  }

  /**
   * Safely quote string for shell usage
   */
  private shSingleQuote(s: string): string {
    return `'${s.replace(/'/g, `'\''`)}'`;
  }

  /**
   * Get current active container count
   */
  private getActiveContainerCount(): number {
    try {
      const output = this.sshTenant('docker ps -q | wc -l');
      return parseInt(output, 10) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Check if VPS has capacity for new container
   */
  private checkCapacity(): { allowed: boolean; current: number; max: number; message?: string } {
    const limits = RESOURCE_LIMITS[this.tier];
    const current = this.getActiveContainerCount();
    
    if (current >= limits.maxContainers) {
      return {
        allowed: false,
        current,
        max: limits.maxContainers,
        message: `VPS at capacity: ${current}/${limits.maxContainers} containers. Upgrade to ${this.tier === 'kvm-4' ? 'kvm-8' : 'higher tier'} tier or decommission existing agents.`,
      };
    }
    
    return { allowed: true, current, max: limits.maxContainers };
  }

  /**
   * Main provisioning flow
   */
  async provision(cfg: ProvisioningConfig): Promise<ProvisioningResult> {
    try {
      // Check capacity limits before provisioning
      const capacity = this.checkCapacity();
      if (!capacity.allowed) {
        return {
          success: false,
          tenantId: cfg.tenantId,
          dashboardPort: cfg.dashboardPort,
          gatewayToken: '',
          containerName: '',
          vpsHost: this.vpsHost,
          error: capacity.message,
        };
      }

      const {
        tenantId,
        agentName,
        templateId,
        provider,
        modelPreset,
        dashboardPort,
        botToken,
        botUsername,
        openaiApiKey,
        anthropicApiKey,
        openrouterApiKey
      } = cfg;

      const containerName = `hfsp_${tenantId}`;
      const tenantDir = `${this.config.basedir}/${tenantId}`;
      const workspaceDir = `${tenantDir}/workspace`;
      const secretsDir = `${tenantDir}/secrets`;

      // Ensure directories exist
      this.sshTenant(`mkdir -p ${workspaceDir} ${secretsDir}`);

      // Write Telegram token
      const telegramTokenB64 = Buffer.from(botToken + '\n').toString('base64');
      this.sshTenant(
        `bash -lc 'echo ${this.shSingleQuote(telegramTokenB64)} | base64 -d > ${secretsDir}/telegram.token'`
      );

      // Write LLM API keys based on provider
      if (provider === 'openai' && openaiApiKey) {
        const k = Buffer.from(openaiApiKey.trim() + '\n').toString('base64');
        this.sshTenant(
          `bash -lc 'echo ${this.shSingleQuote(k)} | base64 -d > ${secretsDir}/openai.key'`
        );
      }
      if (provider === 'anthropic' && anthropicApiKey) {
        const k = Buffer.from(anthropicApiKey.trim() + '\n').toString('base64');
        this.sshTenant(
          `bash -lc 'echo ${this.shSingleQuote(k)} | base64 -d > ${secretsDir}/anthropic.key'`
        );
      }
      if (provider === 'openrouter' && openrouterApiKey) {
        const k = Buffer.from(openrouterApiKey.trim() + '\n').toString('base64');
        this.sshTenant(
          `bash -lc 'echo ${this.shSingleQuote(k)} | base64 -d > ${secretsDir}/openrouter.key'`
        );
      }

      // Generate gateway token
      const gatewayToken = Buffer.from(
        `${tenantId}:${Math.random().toString(36).slice(2)}`
      )
        .toString('hex')
        .slice(0, 48);

      // Build auth profile based on provider
      const authProfile: Record<string, any> = {};
      if (provider === 'anthropic') {
        authProfile['anthropic:default'] = { provider: 'anthropic', mode: 'api_key' };
      } else if (provider === 'openai') {
        authProfile['openai:default'] = { provider: 'openai', mode: 'api_key' };
      } else if (provider === 'openrouter') {
        authProfile['openrouter:default'] = { provider: 'openrouter', mode: 'api_key' };
      }

      // Create openclaw.json config
      const openclawConfig: Record<string, any> = {
        agents: {
          defaults: {
            workspace: '/tenant/workspace'
          },
          list: [
            {
              id: 'main',
              default: true,
              name: agentName ?? (templateId === 'ops_starter' ? 'Ops Starter' : 'Blank'),
              workspace: '/tenant/workspace',
              model: modelPreset ?? undefined,
              identity: { name: agentName ?? 'Agent', emoji: '🧭' }
            }
          ]
        },
        ...(Object.keys(authProfile).length > 0 ? { auth: { profiles: authProfile } } : {}),
        gateway: {
          port: dashboardPort,
          bind: 'lan',
          mode: 'local',
          auth: { mode: 'token', token: gatewayToken },
          controlUi: {
            enabled: true,
            allowedOrigins: [
              `http://localhost:${dashboardPort}`,
              `http://127.0.0.1:${dashboardPort}`
            ]
          }
        },
        plugins: { entries: { telegram: { enabled: true } } },
        channels: {
          telegram: {
            enabled: true,
            accounts: {
              default: {
                enabled: true,
                dmPolicy: 'pairing',
                groupPolicy: 'disabled',
                tokenFile: '/home/clawd/.openclaw/secrets/telegram.token',
                streaming: 'off'
              }
            }
          }
        },
        bindings: [{ agentId: 'main', match: { channel: 'telegram', accountId: 'default' } }]
      };

      const configB64 = Buffer.from(JSON.stringify(openclawConfig, null, 2)).toString('base64');
      this.sshTenant(
        `bash -lc 'echo ${this.shSingleQuote(configB64)} | base64 -d > ${tenantDir}/openclaw.json'`
      );

      // Stop/remove existing container if present
      this.sshTenant(`docker rm -f ${containerName} >/dev/null 2>&1 || true`);

      // Get resource limits for this tier
      const limits = RESOURCE_LIMITS[this.tier];

      // Start container with resource limits
      const runParts = [
        'docker run -d',
        `--name ${containerName}`,
        '--restart unless-stopped',
        // Resource limits
        `--memory=${limits.memory}`,
        `--memory-swap=${limits.memorySwap}`,
        `--cpus=${limits.cpus}`,
        `--pids-limit=${limits.pidsLimit}`,
        // Network
        `-p 127.0.0.1:${dashboardPort}:${dashboardPort}`,
        // Volumes
        `-v ${workspaceDir}:/tenant/workspace`,
        `-v ${tenantDir}/openclaw.json:/home/clawd/.openclaw/openclaw.json:ro`,
        `-v ${secretsDir}:/home/clawd/.openclaw/secrets:ro`,
      ];
      if (provider === 'openrouter') {
        runParts.push(`-e OPENROUTER_API_KEY="$(cat ${secretsDir}/openrouter.key | tr -d '\\n\\r')"`);
      } else if (provider === 'openai') {
        runParts.push(`-e OPENAI_API_KEY="$(cat ${secretsDir}/openai.key | tr -d '\\n\\r')"`);
      } else if (provider === 'anthropic') {
        runParts.push(`-e ANTHROPIC_API_KEY="$(cat ${secretsDir}/anthropic.key | tr -d '\\n\\r')"`);
      }
      runParts.push(this.config.runtimeImage);
      const runCmd = runParts.join(' ');

      this.sshTenant(runCmd);

      // Fix workspace permissions inside container
      this.sshTenant(
        `docker exec -u root ${containerName} bash -lc ${this.shSingleQuote(
          'chown -R 10001:10001 /tenant/workspace || true; chmod -R u+rwX /tenant/workspace || true'
        )}`
      );

      return {
        success: true,
        tenantId,
        dashboardPort,
        gatewayToken,
        containerName,
        vpsHost: this.vpsHost
      };
    } catch (err) {
      return {
        success: false,
        tenantId: cfg.tenantId,
        dashboardPort: cfg.dashboardPort,
        gatewayToken: '',
        containerName: '',
        vpsHost: this.vpsHost,
        error: (err as Error)?.message ?? String(err)
      };
    }
  }

  async deprovision(tenantId: string): Promise<void> {
    try {
      const containerName = `hfsp_${tenantId}`;
      const tenantDir = `${this.config.basedir}/${tenantId}`;
      const trashDir = `${this.config.basedir}/.trash/${tenantId}-${Date.now()}`;

      // Stop and remove container
      this.sshTenant(`docker rm -f ${containerName} >/dev/null 2>&1 || true`);

      // Move tenant directory to trash
      this.sshTenant(
        `mkdir -p ${this.config.basedir}/.trash && (mv ${tenantDir} ${trashDir} 2>/dev/null || true)`
      );
    } catch (err) {
      console.error(`Deprovision error for ${tenantId}:`, err);
      throw err;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      this.sshTenant('echo "health ok"');
      return true;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<any> {
    try {
      const info = this.sshTenant('docker ps --format "{{.Names}}" | grep hfsp_ | wc -l');
      const current = parseInt(info, 10) || 0;
      const limits = RESOURCE_LIMITS[this.tier];
      return {
        vpsHost: this.vpsHost,
        tier: this.tier,
        activeContainers: current,
        maxContainers: limits.maxContainers,
        utilization: `${current}/${limits.maxContainers}`,
        status: current >= limits.maxContainers ? 'at_capacity' : 'ok',
      };
    } catch (err) {
      return {
        vpsHost: this.vpsHost,
        tier: this.tier,
        status: 'error',
        error: (err as Error)?.message,
      };
    }
  }
}
