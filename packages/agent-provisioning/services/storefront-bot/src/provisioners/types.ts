/**
 * Provisioner abstraction layer
 * Handles tenant container provisioning across single or multiple VPS nodes
 */

export interface ProvisioningConfig {
  tenantId: string;
  agentName: string;
  templateId: string;
  provider: 'openai' | 'anthropic' | 'openrouter';
  modelPreset: string;
  dashboardPort: number;
  botToken: string;
  botUsername?: string;
  
  // API keys (should be encrypted before passing)
  openaiApiKey?: string;
  anthropicApiKey?: string;
  openrouterApiKey?: string;
}

export interface ProvisioningResult {
  success: boolean;
  tenantId: string;
  dashboardPort: number;
  gatewayToken: string;
  containerName: string;
  vpsHost: string;
  vpsNode?: string; // Node ID if using multi-VPS
  error?: string;
}

export interface ProvisionerConfig {
  sshKey: string;
  runtimeImage: string;
  basedir: string;
  vpsRegistry?: any; // VpsRegistry instance for multi-VPS provisioners
}

export abstract class BaseProvisioner {
  protected config: ProvisionerConfig;

  constructor(config: ProvisionerConfig) {
    this.config = config;
  }

  /**
   * Provision a new tenant container
   */
  abstract provision(cfg: ProvisioningConfig): Promise<ProvisioningResult>;

  /**
   * Deprovision (delete) a tenant container
   */
  abstract deprovision(tenantId: string): Promise<void>;

  /**
   * Health check for the provisioner/VPS
   */
  abstract healthCheck(): Promise<boolean>;

  /**
   * Get provisioner status/info
   */
  abstract getStatus(): Promise<any>;
}
