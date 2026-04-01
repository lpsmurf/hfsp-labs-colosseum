import { execFileSync } from 'child_process';
import { BaseProvisioner, ProvisioningConfig, ProvisioningResult, ProvisionerConfig } from './types';

/**
 * ShellProvisioner: Single VPS provisioning via SSH + Docker
 * Extracts current bot provisioning logic into a reusable class
 */
export class ShellProvisioner extends BaseProvisioner {
  private vpsHost: string;
  private vpsUser: string;
  private sshOpts: string[];

  constructor(
    config: ProvisionerConfig,
    vpsHost: string = '187.124.173.69',
    vpsUser: string = 'root'
  ) {
    super(config);
    this.vpsHost = vpsHost;
    this.vpsUser = vpsUser;
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
    return `'${s.replace(/'/g, `'\\''`)}'`;
  }

  /**
   * Main provisioning flow
   */
  async provision(cfg: ProvisioningConfig): Promise<ProvisioningResult> {
    try {
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

      // Create openclaw.json config
      const openclawConfig = {
        agents: {
          defaults: {
            workspace: '/tenant/workspace'
          },
          list: [
            {
              id: 'main',
              default: true,
              name: templateId === 'ops_starter' ? 'Ops Starter' : 'Blank',
              workspace: '/tenant/workspace',
              identity: { name: agentName ?? 'Agent', emoji: '🧭' }
            }
          ]
        },
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

      // Start container
      const runCmd = [
        'docker run -d',
        `--name ${containerName}`,
        '--restart unless-stopped',
        `-p 127.0.0.1:${dashboardPort}:${dashboardPort}`,
        `-v ${workspaceDir}:/tenant/workspace`,
        `-v ${tenantDir}/openclaw.json:/home/clawd/.openclaw/openclaw.json:ro`,
        `-v ${secretsDir}:/home/clawd/.openclaw/secrets:ro`,
        this.config.runtimeImage
      ].join(' ');

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
      return {
        vpsHost: this.vpsHost,
        activeContainers: parseInt(info, 10) || 0,
        status: 'ok'
      };
    } catch (err) {
      return {
        vpsHost: this.vpsHost,
        status: 'error',
        error: (err as Error)?.message
      };
    }
  }
}
