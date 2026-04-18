# Provisioner Integration Guide

## Overview

The provisioner abstraction decouples bot logic from infrastructure provisioning. This allows HFSP to support:
- **Single VPS** (ShellProvisioner) - current mode
- **Multi-VPS cluster** (MultiVpsProvisioner) - future scale-out

## Architecture

```
ProvisionerFactory (decision point)
  ↓
  ├─→ ShellProvisioner (single VPS via SSH + Docker)
  └─→ MultiVpsProvisioner (cluster with smart node selection)
```

## Integration Steps

### 1. Initialize Provisioner in Bot

Replace lines 123-128 in `index.ts`:

```typescript
// BEFORE: Individual VPS config
const TENANT_VPS_HOST = process.env.TENANT_VPS_HOST ?? '187.124.173.69';
const TENANT_VPS_USER = process.env.TENANT_VPS_USER ?? 'root';
const TENANT_VPS_SSH_KEY = process.env.TENANT_VPS_SSH_KEY ?? '...';

// AFTER: Provisioner abstraction
import { ProvisionerFactory, BaseProvisioner } from './provisioners';
import { VpsRegistry } from '../vps-registry';

const PROVISIONER_CONFIG = {
  sshKey: process.env.TENANT_VPS_SSH_KEY ?? '...',
  runtimeImage: process.env.TENANT_RUNTIME_IMAGE ?? 'hfsp/openclaw-runtime:stable',
  basedir: process.env.TENANT_VPS_BASEDIR ?? '/opt/hfsp/tenants',
  vpsRegistry: new VpsRegistry(db)
};

const PROVISIONER_MODE = process.env.PROVISIONER_MODE ?? 'shell'; // 'shell' or 'multi-vps'

const provisioner: BaseProvisioner = ProvisionerFactory.createProvisioner(
  PROVISIONER_CONFIG,
  {
    mode: PROVISIONER_MODE as any,
    vpsRegistry: PROVISIONER_CONFIG.vpsRegistry,
    vpsHost: process.env.TENANT_VPS_HOST ?? '187.124.173.69',
    vpsUser: process.env.TENANT_VPS_USER ?? 'root'
  }
);
```

### 2. Replace Provisioning Code (lines 900-1165)

```typescript
// BEFORE: Inline sshTenant() + docker commands
const out = sshTenant(`sudo /usr/local/bin/hfsp_dash_allow_key ...`);
const runCmd = [...docker commands...];
sshTenant(runCmd);

// AFTER: Use provisioner abstraction
const result = await provisioner.provision({
  tenantId,
  agentName: w.data.agentName ?? 'Agent',
  templateId: w.data.templateId,
  provider: w.data.provider,
  modelPreset: w.data.modelPreset,
  dashboardPort,
  botToken: w.data.botToken ?? '',
  botUsername: w.data.botUsername,
  openaiApiKey: w.data.openaiApiKey,
  anthropicApiKey: w.data.anthropicApiKey,
  openrouterApiKey: w.data.openrouterApiKey
});

if (!result.success) {
  throw new Error(result.error);
}

// result now contains: gatewayToken, containerName, vpsHost, vpsNode
```

### 3. Replace Deprovision Code (around line 1420)

```typescript
// BEFORE
sshTenant(`docker rm -f ${containerName} >/dev/null 2>&1 || true`);
sshTenant(`mkdir -p ${TENANT_VPS_BASEDIR}/.trash && ...`);

// AFTER
await provisioner.deprovision(tenantId);
```

### 4. Add Health Check Endpoint

```typescript
app.get('/provisioner/health', async (req, res) => {
  const healthy = await provisioner.healthCheck();
  const status = await provisioner.getStatus();
  res.json({ healthy, status });
});
```

## Mode Configuration

### Shell Provisioner (Single VPS)
```bash
PROVISIONER_MODE=shell
TENANT_VPS_HOST=187.124.173.69
TENANT_VPS_USER=root
TENANT_VPS_SSH_KEY=/path/to/key
```

### Multi-VPS Provisioner (Cluster)
```bash
PROVISIONER_MODE=multi-vps
# VPS nodes registered via VpsRegistry API
# VpsRegistry reads from database (vps_nodes table)
```

## VPS Registry Integration

MultiVpsProvisioner requires VpsRegistry to be initialized:

```typescript
const vpsRegistry = new VpsRegistry(db);

// Register nodes (typically done via admin API)
vpsRegistry.addNode({
  id: 'piercalito',
  host: '72.62.239.63',
  ssh_user: 'root',
  port_range_start: 19000,
  port_range_end: 19999,
  max_containers: 80
});

// Provisioner will use registry for intelligent selection
const provisioner = ProvisionerFactory.createProvisioner(
  config,
  { mode: 'multi-vps', vpsRegistry }
);
```

## Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Single VPS only** | ❌ Hardcoded IP | ✅ Registry-driven |
| **Scaling** | 🚫 Not possible | ✅ Add nodes at runtime |
| **Port allocation** | Random collision risk | Smart per-node ranges |
| **Failover** | Manual | Automatic (future) |
| **Testing** | Coupled to real VPS | Can mock provisioner |

## File Structure

```
services/storefront-bot/src/provisioners/
├── types.ts                  # Interfaces & abstract base
├── ShellProvisioner.ts       # Single VPS implementation
├── MultiVpsProvisioner.ts    # Multi-VPS implementation
├── ProvisionerFactory.ts     # Factory pattern
├── index.ts                  # Public exports
└── INTEGRATION_GUIDE.md      # This file
```

## Next Steps

1. **Phase 1:** Wire ShellProvisioner into bot (drop-in replacement)
2. **Phase 2:** Test with VpsRegistry (multi-VPS dry run)
3. **Phase 3:** Deploy MultiVpsProvisioner to staging
4. **Phase 4:** Auto-scale trigger (add nodes when capacity > 80%)
