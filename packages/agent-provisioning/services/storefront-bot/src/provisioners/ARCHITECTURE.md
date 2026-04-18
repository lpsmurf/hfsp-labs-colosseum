# Provisioner Architecture

## Current State (Before)
```
┌─────────────────────────────────────────────┐
│      Telegram Bot (index.ts)                │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │  Provisioning Logic (lines 900-1165)  │ │
│  │  ├─ sshTenant(command)               │ │
│  │  ├─ Docker commands (inline)         │ │
│  │  ├─ Key generation                  │ │
│  │  ├─ Directory creation              │ │
│  │  └─ Port allocation (random)        │ │
│  └─────────────┬───────────────────────┘ │
│                │                         │
└────────────────┼─────────────────────────┘
                 │
            SSH over single VPS
                 │
          ┌──────▼─────────┐
          │ 187.124.173.69 │
          │ (TENANT_VPS)   │
          └────────────────┘

Problems:
❌ Hardcoded single VPS
❌ No abstraction layer
❌ Can't scale horizontally
❌ Difficult to test
❌ No load balancing
```

## New State (After)
```
┌──────────────────────────────────────────────────────────────┐
│            Telegram Bot (index.ts)                           │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Bot Logic (cleaner, ~30 line provisioning call)      │ │
│  │                                                        │ │
│  │  result = await provisioner.provision({...})         │ │
│  │                                                        │ │
│  └────────────────┬─────────────────────────────────────┘ │
└───────────────────┼──────────────────────────────────────────┘
                    │
        ┌───────────▼────────────┐
        │  ProvisionerFactory    │
        │  (decision point)      │
        └───────────┬────────────┘
                    │
        ┌───────────┴──────────────────┐
        │                              │
    ┌───▼──────────────┐       ┌──────▼──────────────┐
    │ ShellProvisioner │       │ MultiVpsProvisioner│
    │ (single VPS)     │       │ (cluster)          │
    └────┬─────────────┘       └────────┬───────────┘
         │                              │
         │ SSH                          │ Via VpsRegistry
         │                              │
    ┌────▼──────────┐            ┌──────┴─────────────┐
    │ Single VPS    │            │                    │
    │187.124.173.69 │      ┌─────▼──────┐   ┌────────▼─────┐
    └───────────────┘      │   NODE-1   │   │   NODE-2     │
                           │ 72.62.*.63 │   │ 187.124.*.69 │
                           └────────────┘   └──────────────┘

Benefits:
✅ Swappable provisioners
✅ Multi-VPS ready
✅ Registry-driven node discovery
✅ Intelligent port allocation
✅ Load balancing capable
✅ Easy to test (can mock)
✅ Runtime node addition
```

## Component Responsibilities

### BaseProvisioner (Abstract)
- Defines provisioning interface
- Ensures all provisioners implement required methods
- Methods: `provision()`, `deprovision()`, `healthCheck()`, `getStatus()`

### ShellProvisioner
- Single VPS implementation (drop-in replacement for current code)
- Direct SSH + Docker execution
- SSH key management
- Container lifecycle management
- Used when: Single VPS or fallback mode

### MultiVpsProvisioner
- Multi-VPS cluster implementation
- Coordinates with VpsRegistry for node selection
- Delegates to ShellProvisioner per node
- Intelligent port allocation per node
- Failure handling and retries
- Used when: Cluster mode with multiple nodes

### ProvisionerFactory
- Decision logic: which provisioner to use
- Configuration-driven (env vars or explicit)
- Returns appropriate BaseProvisioner instance

### VpsRegistry (already built)
- Maintains node inventory
- Tracks capacity and ports
- Selects best node for provisioning
- Allocates/releases ports
- Thread-safe database-backed

## Provisioning Flow (with new architecture)

```
User taps "🚀 Provision Agent" in Telegram
            │
            ▼
┌───────────────────────────────────────┐
│ provisioningCallback() in bot          │
│                                       │
│ 1. Validate wizard state             │
│ 2. Generate tenant ID                │
│ 3. Allocate dashboard port           │
│ 4. Create DB record                  │
└────────────┬──────────────────────────┘
             │
             ▼
┌───────────────────────────────────────┐
│ provisioner.provision({              │
│   tenantId,                          │
│   dashboardPort,                     │
│   agentName,                         │
│   provider,                          │
│   apiKey,                            │
│   ...                                │
│ })                                   │
└────────────┬──────────────────────────┘
             │
             ▼ (Factory decides)
        ┌─────┴────────┐
        │              │
   Single VPS      Multi-VPS
        │              │
        │    ┌─────────┴──────────────────┐
        │    │ VpsRegistry.selectBestNode()│
        │    │ (picks lowest utilization)  │
        │    └──────────────┬──────────────┘
        │                   │
        │                   ▼
        │    ┌──────────────────────────┐
        │    │ Get node provisioner     │
        │    │ (ShellProvisioner)       │
        │    └────────────┬─────────────┘
        │                 │
        └────────┬────────┘
                 │
                 ▼
    ┌──────────────────────────────┐
    │ ShellProvisioner.provision() │
    │                              │
    │ 1. SSH: mkdir workspace      │
    │ 2. SSH: write secrets        │
    │ 3. SSH: write openclaw.json  │
    │ 4. SSH: docker run...        │
    │ 5. SSH: fix permissions      │
    │ 6. Return result             │
    └──────────────┬───────────────┘
                   │
                   ▼
    ┌──────────────────────────────┐
    │ Return ProvisioningResult:   │
    │ {                            │
    │   success: true,             │
    │   tenantId,                  │
    │   dashboardPort,             │
    │   gatewayToken,              │
    │   containerName,             │
    │   vpsHost,                   │
    │   vpsNode (for multi-vps)    │
    │ }                            │
    └──────────────┬───────────────┘
                   │
                   ▼
    ┌──────────────────────────────┐
    │ Bot sends pairing message:   │
    │ "Provisioned ✅"             │
    │ - Open your bot              │
    │ - Send /start                │
    │ - Get pairing code           │
    │ - Paste code here            │
    └──────────────────────────────┘
```

## Port Allocation Strategy

### ShellProvisioner (Single VPS)
- Random allocation from 19000-19999
- Check used ports, avoid collisions
- Risk: collisions as load increases

### MultiVpsProvisioner (Multi-VPS)
- Registry tracks per-node port ranges
- Each node has dedicated range: `port_range_start` to `port_range_end`
- Example:
  - PIERCALITO: 19000-19999 (1000 ports, 80 agents @ 12-13 ports each)
  - NODE-2: 20000-20999 (1000 ports)
  - NODE-3: 21000-21999 (1000 ports)
- Guaranteed no collisions
- Scales linearly with nodes

## Testing Strategy

```typescript
// Mock provisioner for unit tests
class MockProvisioner extends BaseProvisioner {
  async provision(cfg: ProvisioningConfig): Promise<ProvisioningResult> {
    return {
      success: true,
      tenantId: cfg.tenantId,
      dashboardPort: 19000 + Math.random() * 1000,
      gatewayToken: 'mock-token',
      containerName: `mock_${cfg.tenantId}`,
      vpsHost: 'mock-vps'
    };
  }
  
  async deprovision(tenantId: string): Promise<void> {
    console.log(`Mock deprovision ${tenantId}`);
  }
  
  async healthCheck(): Promise<boolean> {
    return true;
  }
  
  async getStatus(): Promise<any> {
    return { status: 'mock-ok' };
  }
}

// Use in bot tests without real SSH/Docker
const provisioner = new MockProvisioner(...);
```

## Migration Path

### Week 1: ShellProvisioner Integration
- [ ] Wire ShellProvisioner into bot (lines 123-128, 900-1165, 1420)
- [ ] Test with single VPS (must work identically)
- [ ] Verify no functionality regression

### Week 2: VpsRegistry + MultiVpsProvisioner
- [ ] Initialize VpsRegistry in bot
- [ ] Register PIERCALITO as primary node
- [ ] Switch mode to 'multi-vps' (env var)
- [ ] Test with single node (should work identically)

### Week 3: Multiple Nodes
- [ ] Add NODE-2 to VpsRegistry
- [ ] Create NODE-2 infrastructure
- [ ] Test load balancing (provision to NODE-2)

### Week 4: Auto-scale
- [ ] Build NodeScaler service
- [ ] Trigger: capacity > 80%
- [ ] Auto-provision new node
- [ ] Register in VpsRegistry
- [ ] Resume provisioning
