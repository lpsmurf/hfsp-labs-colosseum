import { BaseProvisioner, ProvisioningConfig, ProvisioningResult, ProvisionerConfig } from './types';
import { ShellProvisioner } from './ShellProvisioner';

/**
 * MultiVpsProvisioner: Intelligent multi-VPS provisioning
 * Uses VPS Registry to:
 * - Select best available node based on capacity
 * - Allocate unique port per node
 * - Load-balance tenants across cluster
 * - Handle node failover
 */
export class MultiVpsProvisioner extends BaseProvisioner {
  private nodeProvisioners: Map<string, ShellProvisioner> = new Map();
  private vpsRegistry: any; // VpsRegistry instance

  constructor(config: ProvisionerConfig, vpsRegistry: any) {
    super(config);
    this.vpsRegistry = vpsRegistry;
    this._initializeNodeProvisioners();
  }

  /**
   * Initialize ShellProvisioner for each registered VPS node
   */
  private _initializeNodeProvisioners(): void {
    const nodes = this.vpsRegistry.getAllNodes?.();
    if (!nodes || nodes.length === 0) {
      console.warn('No VPS nodes registered in registry');
      return;
    }

    for (const node of nodes) {
      const provisioner = new ShellProvisioner(
        this.config,
        node.host,
        node.ssh_user || 'root'
      );
      this.nodeProvisioners.set(node.id, provisioner);
    }
  }

  /**
   * Select best node for provisioning based on available capacity
   */
  private selectBestNode(): string {
    const bestNode = this.vpsRegistry.selectBestNode?.();
    if (!bestNode) {
      throw new Error(
        'No available VPS nodes. Cluster is at capacity or not configured.'
      );
    }
    return bestNode.id;
  }

  /**
   * Get port allocation for a specific node
   */
  private allocatePort(nodeId: string): number {
    const port = this.vpsRegistry.getNextAvailablePort?.(nodeId);
    if (!port) {
      throw new Error(`No available ports on node ${nodeId}`);
    }
    return port;
  }

  /**
   * Provision tenant on best available node
   */
  async provision(cfg: ProvisioningConfig): Promise<ProvisioningResult> {
    try {
      // Select node and allocate port
      const nodeId = this.selectBestNode();
      const allocatedPort = this.allocatePort(nodeId);

      // Update config to use allocated port
      const provConfig = {
        ...cfg,
        dashboardPort: allocatedPort
      };

      // Get node-specific provisioner
      const provisioner = this.nodeProvisioners.get(nodeId);
      if (!provisioner) {
        throw new Error(`No provisioner for node ${nodeId}`);
      }

      // Provision on selected node
      const result = await provisioner.provision(provConfig);

      // Mark port as allocated in registry
      if (result.success) {
        this.vpsRegistry.allocatePort?.(nodeId, cfg.tenantId);
      }

      return {
        ...result,
        vpsNode: nodeId
      };
    } catch (err) {
      return {
        success: false,
        tenantId: cfg.tenantId,
        dashboardPort: cfg.dashboardPort,
        gatewayToken: '',
        containerName: '',
        vpsHost: '',
        error: (err as Error)?.message ?? String(err)
      };
    }
  }

  /**
   * Deprovision tenant and free resources
   */
  async deprovision(tenantId: string): Promise<void> {
    try {
      // Release port in registry
      this.vpsRegistry.releasePort?.(tenantId);

      // Find which node has this tenant and deprovision
      const nodeId = this.vpsRegistry.findNodeForTenant?.(tenantId);
      if (!nodeId) {
        console.warn(`Tenant ${tenantId} not found in registry`);
        return;
      }

      const provisioner = this.nodeProvisioners.get(nodeId);
      if (!provisioner) {
        throw new Error(`No provisioner for node ${nodeId}`);
      }

      await provisioner.deprovision(tenantId);
    } catch (err) {
      console.error(`Deprovision error for ${tenantId}:`, err);
      throw err;
    }
  }

  /**
   * Check health of all nodes
   */
  async healthCheck(): Promise<boolean> {
    let allHealthy = true;

    for (const [nodeId, provisioner] of this.nodeProvisioners) {
      const healthy = await provisioner.healthCheck();
      if (!healthy) {
        console.warn(`Node ${nodeId} health check failed`);
        allHealthy = false;
      }
    }

    return allHealthy;
  }

  /**
   * Get cluster status including all nodes
   */
  async getStatus(): Promise<any> {
    const nodeStatuses = new Map();

    for (const [nodeId, provisioner] of this.nodeProvisioners) {
      const status = await provisioner.getStatus();
      nodeStatuses.set(nodeId, status);
    }

    return {
      mode: 'multi-vps',
      totalNodes: this.nodeProvisioners.size,
      nodeStatuses: Object.fromEntries(nodeStatuses),
      registrySummary: this.vpsRegistry.getSummary?.()
    };
  }

  /**
   * Add a new VPS node to the cluster at runtime
   */
  addNode(nodeConfig: {
    id: string;
    host: string;
    ssh_user?: string;
    port_range_start?: number;
    port_range_end?: number;
  }): void {
    const provisioner = new ShellProvisioner(
      this.config,
      nodeConfig.host,
      nodeConfig.ssh_user || 'root'
    );
    this.nodeProvisioners.set(nodeConfig.id, provisioner);

    // Register in VPS registry
    this.vpsRegistry.addNode?.(nodeConfig);
  }

  /**
   * Remove a VPS node from the cluster
   */
  removeNode(nodeId: string): void {
    this.nodeProvisioners.delete(nodeId);
    // Note: actual removal from registry should be handled separately
  }
}
