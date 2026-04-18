import { BaseProvisioner, ProvisionerConfig } from './types';
import { ShellProvisioner } from './ShellProvisioner';
import { MultiVpsProvisioner } from './MultiVpsProvisioner';

/**
 * ProvisionerFactory: Creates appropriate provisioner based on configuration
 * Decides between single-VPS (ShellProvisioner) and multi-VPS (MultiVpsProvisioner)
 */
export class ProvisionerFactory {
  static createProvisioner(
    config: ProvisionerConfig,
    options?: {
      mode?: 'shell' | 'multi-vps' | 'auto';
      vpsRegistry?: any;
      vpsHost?: string;
      vpsUser?: string;
    }
  ): BaseProvisioner {
    const mode = options?.mode ?? 'auto';

    // Multi-VPS mode: requires VPS registry
    if (mode === 'multi-vps' || (mode === 'auto' && options?.vpsRegistry)) {
      if (!options?.vpsRegistry) {
        throw new Error('VPS Registry required for multi-VPS mode');
      }
      console.log('📦 Using MultiVpsProvisioner (cluster mode)');
      return new MultiVpsProvisioner(config, options.vpsRegistry);
    }

    // Single-VPS mode: fallback or explicit
    console.log('📦 Using ShellProvisioner (single VPS mode)');
    return new ShellProvisioner(
      config,
      options?.vpsHost,
      options?.vpsUser
    );
  }
}

export { BaseProvisioner, ShellProvisioner, MultiVpsProvisioner };
