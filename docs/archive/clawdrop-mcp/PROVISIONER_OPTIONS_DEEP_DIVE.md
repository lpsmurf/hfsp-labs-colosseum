# Phase 1 Deep Dive: Provisioner Backend Options

**Status**: This is your **blocking decision**. Everything in Phase 1 depends on this choice.

**What is a "provisioner"?**
The provisioner is the system that:
1. Receives a deployment request from the Control Plane MCP
2. Spins up a Docker container with the OpenClaw runtime
3. Reports back the container ID, endpoint, and status
4. Manages the container lifecycle (health checks, logs, teardown)

---

# The Three Options Explained

## OPTION A: SSH + Docker CLI (Fastest for Friday)

### What It Is
Run Docker commands over SSH on a remote server.

```
Control Plane MCP (this laptop)
    ↓ SSH command over network
Remote Server (e.g., your VPS)
    ↓ executes: docker run clawdrop/openclaw:latest
Docker Container running on remote server
    ↓ container listening on port 8001
Customer accesses via http://remote-server:8001
```

### Pros
- ✅ **Fastest to implement** (1.5 hours)
- ✅ **No dependencies** (just SSH, Docker, child_process)
- ✅ **Works Friday** with high confidence
- ✅ **Transparent** (you can SSH in and debug manually)
- ✅ **Flexible** (any server with Docker works)

### Cons
- ❌ **Not scalable** (one server, doesn't distribute load)
- ❌ **Manual server management** (you provision the VPS, SSH keys, etc.)
- ❌ **Simple error handling** (SSH timeouts, container crashes)
- ❌ **Network latency** (command execution over SSH adds 100-500ms)
- ❌ **Not production-ready** (no HA, no failover)

### Implementation Complexity
```
Difficulty:     Easy ████░░░░░░ 4/10
Time to build:  1.5 hours
Time to debug:  30 min (SSH debugging is straightforward)
Production-ready: No
Scalability:    Single server only
```

### Example Code

```typescript
// src/provisioner/ssh-docker-provisioner.ts

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class SSHDockerProvisioner implements IProvisioner {
  private host: string;
  private user: string;

  constructor(host: string = process.env.PROVISIONER_HOST || 'localhost', 
              user: string = process.env.PROVISIONER_USER || 'deploy') {
    this.host = host;
    this.user = user;
  }

  /**
   * Deploy a new container via SSH
   */
  async deploy(req: DeployRequest): Promise<DeployResponse> {
    try {
      logger.info({ deployment_id: req.deployment_id }, 'Starting SSH deployment');

      // Generate unique port (avoid collisions)
      const port = 8001 + (parseInt(req.deployment_id.slice(0, 8), 16) % 1000);

      // Build Docker run command
      // Note: We're using sh -c to ensure proper escaping through SSH
      const dockerCmd = [
        'docker run -d',
        `--name ${req.deployment_id}`,
        `--restart=unless-stopped`,
        `-p ${port}:8000`,
        `-e DEPLOYMENT_ID=${req.deployment_id}`,
        `-e BUNDLE=${req.capability_bundle}`,
        `-e WALLET=${req.wallet_address}`,
        `-m 512m`, // Memory limit
        `--cpus=0.5`, // CPU limit
        'clawdrop/openclaw:latest'
      ].join(' ');

      // Escape for SSH execution
      const sshCmd = `ssh ${this.user}@${this.host} "${dockerCmd}"`;

      logger.debug({ cmd: sshCmd }, 'Executing SSH command');

      // Execute over SSH (with timeout)
      const { stdout, stderr } = await execAsync(sshCmd, {
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024, // 1MB buffer
      });

      const container_id = stdout.trim();
      if (!container_id) {
        throw new Error('Docker run returned empty container ID');
      }

      logger.info(
        { deployment_id: req.deployment_id, container_id, port },
        'Container started successfully'
      );

      return {
        deployment_id: req.deployment_id,
        runtime_instance_id: `rt_${req.deployment_id}`,
        status: 'provisioning',
        endpoint: `http://${this.host}:${port}`,
        container_id,
        server_id: this.host,
        error: null,
      };
    } catch (error) {
      logger.error(
        { deployment_id: req.deployment_id, error: error.message },
        'SSH deployment failed'
      );

      return {
        deployment_id: req.deployment_id,
        runtime_instance_id: '',
        status: 'error',
        endpoint: null,
        error: error.message,
      };
    }
  }

  /**
   * Check deployment status via SSH
   */
  async status(deploymentId: string): Promise<DeploymentStatus> {
    try {
      // Check if container is running
      const inspectCmd = `ssh ${this.user}@${this.host} "docker inspect ${deploymentId} --format='{{.State.Status}}'"`;
      
      const { stdout } = await execAsync(inspectCmd, { timeout: 10000 });
      const containerStatus = stdout.trim();

      if (containerStatus === 'running') {
        return {
          deployment_id: deploymentId,
          runtime_instance_id: `rt_${deploymentId}`,
          status: 'ready',
          health: 'passing',
          endpoint: `http://${this.host}:8001`, // Simplified
          included_capabilities: [],
          recent_logs: await this.logs(deploymentId),
          error: null,
        };
      } else {
        return {
          deployment_id: deploymentId,
          runtime_instance_id: `rt_${deploymentId}`,
          status: 'provisioning',
          health: 'degraded',
          endpoint: null,
          included_capabilities: [],
          recent_logs: [],
          error: null,
        };
      }
    } catch (error) {
      logger.error({ deploymentId, error: error.message }, 'Status check failed');

      return {
        deployment_id: deploymentId,
        runtime_instance_id: '',
        status: 'error',
        health: 'failing',
        endpoint: null,
        included_capabilities: [],
        recent_logs: [],
        error: error.message,
      };
    }
  }

  /**
   * Get container logs via SSH
   */
  async logs(deploymentId: string): Promise<string[]> {
    try {
      const logsCmd = `ssh ${this.user}@${this.host} "docker logs ${deploymentId} --tail 20"`;
      const { stdout } = await execAsync(logsCmd, { timeout: 10000 });
      return stdout.split('\n').filter(l => l.trim());
    } catch {
      return [];
    }
  }

  /**
   * Cleanup: delete container via SSH
   */
  async delete(deploymentId: string): Promise<void> {
    try {
      const deleteCmd = `ssh ${this.user}@${this.host} "docker rm -f ${deploymentId}"`;
      await execAsync(deleteCmd, { timeout: 10000 });
      logger.info({ deploymentId }, 'Container deleted');
    } catch (error) {
      logger.error({ deploymentId, error: error.message }, 'Failed to delete container');
    }
  }
}

// Usage:
const provisioner = new SSHDockerProvisioner(
  'deploy.example.com', // Your server
  'ubuntu' // Your SSH user
);
```

### Setup Requirements
```bash
# On your remote server:
1. Install Docker
2. Create 'deploy' user with Docker access
3. Set up SSH key authentication
4. Ensure clawdrop/openclaw:latest image is available

# On your local machine:
1. Add SSH key to ~/.ssh/
2. Set environment variables:
   export PROVISIONER_HOST=deploy.example.com
   export PROVISIONER_USER=ubuntu
```

### Debugging
```bash
# SSH into server
ssh ubuntu@deploy.example.com

# List running containers
docker ps

# Check specific container logs
docker logs dep_1713265800000

# Kill a container if it's stuck
docker kill dep_1713265800000
```

### Friday Demo Viability
**YES** ✅ This works for Friday if:
- You have SSH access to a server
- That server has Docker installed
- You can pull `clawdrop/openclaw:latest`

---

## OPTION B: dockerode Node.js Library (Best Long-Term)

### What It Is
Use the `dockerode` npm package to communicate directly with Docker daemon via HTTP socket.

```
Control Plane MCP (this laptop)
    ↓ HTTP call to Docker socket
Docker Daemon (same machine or network)
    ↓ /var/run/docker.sock or tcp://host:2375
Docker Container created and managed
```

### Pros
- ✅ **Native Node.js** (no SSH, no child_process)
- ✅ **Better error handling** (proper promises, typed responses)
- ✅ **Faster execution** (no SSH overhead, local socket)
- ✅ **Richer API** (stats, logs, events, exec into container)
- ✅ **Production patterns** (async/await, error boundaries)
- ✅ **Easier to test** (mock docker SDK)
- ✅ **Scales better** (can talk to remote Docker daemon)

### Cons
- ❌ **Requires Docker socket access** (security consideration)
- ❌ **Slightly more complex** (2 hours to learn dockerode API)
- ❌ **Local Docker only** (unless you expose Docker daemon over TCP, which is risky)
- ❌ **Single host still** (not distributed)

### Implementation Complexity
```
Difficulty:     Moderate ████████░░ 8/10
Time to build:  2.5 hours
Time to debug:  45 min (better error messages)
Production-ready: Closer to yes
Scalability:    Single docker daemon, but cleaner architecture
```

### Example Code

```typescript
// src/provisioner/docker-provisioner.ts

import Docker, { Container } from 'dockerode';
import { IProvisioner, DeployRequest, DeployResponse, DeploymentStatus } from './contract';
import { logger } from '../utils/logger';

export class DockerProvisioner implements IProvisioner {
  private docker: Docker;

  constructor() {
    // Connect to Docker daemon
    // Uses /var/run/docker.sock by default on Linux
    // Uses 'docker.sock' named pipe on Windows
    // Uses unix socket on Mac
    this.docker = new Docker();
  }

  /**
   * Deploy a new container using Docker SDK
   */
  async deploy(req: DeployRequest): Promise<DeployResponse> {
    try {
      logger.info({ deployment_id: req.deployment_id }, 'Starting Docker deployment');

      // Generate unique port
      const hostPort = 8001 + (parseInt(req.deployment_id.slice(0, 8), 16) % 1000);

      // Create container
      const container = await this.docker.createContainer({
        Image: 'clawdrop/openclaw:latest',
        name: req.deployment_id,
        Env: [
          `DEPLOYMENT_ID=${req.deployment_id}`,
          `BUNDLE=${req.capability_bundle}`,
          `WALLET=${req.wallet_address}`,
          `TIER_ID=${req.tier_id}`,
          `REGION=${req.region}`,
        ],
        ExposedPorts: {
          '8000/tcp': {}, // Container listens on 8000
        },
        HostConfig: {
          PortBindings: {
            '8000/tcp': [{ HostIp: '0.0.0.0', HostPort: hostPort.toString() }],
          },
          Memory: 512 * 1024 * 1024, // 512 MB
          CpuShares: 1024, // 1 CPU core relative weight
          RestartPolicy: {
            Name: 'unless-stopped',
            MaximumRetryCount: 0,
          },
          LogConfig: {
            Type: 'json-file',
            Config: {
              'max-size': '10m',
              'max-file': '3',
            },
          },
        },
        Labels: {
          'clawdrop.deployment_id': req.deployment_id,
          'clawdrop.tier_id': req.tier_id,
          'clawdrop.region': req.region,
        },
      });

      // Start the container
      await container.start();

      logger.info(
        { deployment_id: req.deployment_id, container_id: container.id, port: hostPort },
        'Container started'
      );

      return {
        deployment_id: req.deployment_id,
        runtime_instance_id: `rt_${req.deployment_id}`,
        status: 'provisioning',
        endpoint: `http://localhost:${hostPort}`,
        container_id: container.id,
        server_id: 'local',
        error: null,
      };
    } catch (error) {
      logger.error(
        { deployment_id: req.deployment_id, error: error.message },
        'Docker deployment failed'
      );

      return {
        deployment_id: req.deployment_id,
        runtime_instance_id: '',
        status: 'error',
        endpoint: null,
        error: error.message,
      };
    }
  }

  /**
   * Check deployment status and get real Docker stats
   */
  async status(deploymentId: string): Promise<DeploymentStatus> {
    try {
      const container = this.docker.getContainer(deploymentId);
      const inspect = await container.inspect();

      // Get container stats (CPU, memory usage)
      let stats = null;
      if (inspect.State.Running) {
        try {
          stats = await container.stats({ stream: false });
        } catch (e) {
          logger.warn('Could not fetch container stats', e);
        }
      }

      // Get recent logs
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: 20,
        timestamps: true,
      });

      const logLines = logs.toString().split('\n').filter(l => l.trim());

      // Calculate stats if available
      let cpuPercent = '0.0';
      let memoryMb = '0';

      if (stats) {
        // CPU calculation
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - 
                         (stats.precpu_stats?.cpu_usage?.total_usage || 0);
        const systemDelta = stats.cpu_stats.system_cpu_usage - 
                           (stats.precpu_stats?.system_cpu_usage || 0);
        const cpuCount = stats.cpu_stats.online_cpus || 1;

        if (systemDelta > 0) {
          cpuPercent = ((cpuDelta / systemDelta) * cpuCount * 100).toFixed(1);
        }

        // Memory calculation
        const memoryUsage = stats.memory_stats.usage || 0;
        memoryMb = (memoryUsage / (1024 * 1024)).toFixed(0);
      }

      const uptime = Math.floor(
        (Date.now() - new Date(inspect.State.StartedAt).getTime()) / 1000
      );

      const isReady = inspect.State.Running && uptime > 5;

      return {
        deployment_id: deploymentId,
        runtime_instance_id: `rt_${deploymentId}`,
        status: isReady ? 'ready' : 'provisioning',
        health: inspect.State.Running ? 'passing' : 'degraded',
        container_stats: {
          cpu_percent: cpuPercent,
          memory_mb: memoryMb,
          uptime_seconds: uptime,
        },
        endpoint: inspect.NetworkSettings.Ports?.['8000/tcp']?.[0]?.HostPort 
          ? `http://localhost:${inspect.NetworkSettings.Ports['8000/tcp'][0].HostPort}`
          : null,
        included_capabilities: [],
        recent_logs: logLines,
        error: null,
      };
    } catch (error) {
      logger.error({ deploymentId, error: error.message }, 'Status check failed');

      return {
        deployment_id: deploymentId,
        runtime_instance_id: '',
        status: 'error',
        health: 'failing',
        endpoint: null,
        included_capabilities: [],
        recent_logs: [],
        error: error.message,
      };
    }
  }

  /**
   * Get container logs
   */
  async logs(deploymentId: string): Promise<string[]> {
    try {
      const container = this.docker.getContainer(deploymentId);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: 50,
        timestamps: true,
      });
      return logs.toString().split('\n').filter(l => l.trim());
    } catch (error) {
      logger.error({ deploymentId, error: error.message }, 'Failed to fetch logs');
      return [];
    }
  }

  /**
   * Execute a command inside the container (for debugging)
   */
  async exec(deploymentId: string, cmd: string[]): Promise<string> {
    try {
      const container = this.docker.getContainer(deploymentId);
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
      });
      const stream = await exec.start({ Detach: false });
      return stream.toString();
    } catch (error) {
      logger.error({ deploymentId, error: error.message }, 'Exec failed');
      return '';
    }
  }

  /**
   * Cleanup: stop and remove container
   */
  async delete(deploymentId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(deploymentId);
      await container.stop({ t: 10 }); // 10 second grace period
      await container.remove();
      logger.info({ deploymentId }, 'Container deleted');
    } catch (error) {
      logger.error({ deploymentId, error: error.message }, 'Failed to delete container');
    }
  }

  /**
   * List all deployed containers
   */
  async listDeployments(): Promise<Array<{ id: string; name: string; status: string }>> {
    try {
      const containers = await this.docker.listContainers({ all: true });
      return containers
        .filter(c => c.Labels?.['clawdrop.deployment_id']) // Only Clawdrop containers
        .map(c => ({
          id: c.Id,
          name: c.Names[0]?.replace('/', ''),
          status: c.State,
        }));
    } catch (error) {
      logger.error('Failed to list deployments', error);
      return [];
    }
  }
}

// Usage:
const provisioner = new DockerProvisioner();
```

### Setup Requirements
```bash
# On your local machine (or CI/CD):
1. Docker must be installed and running
2. Docker socket must be accessible (/var/run/docker.sock)
3. Current user must have docker group permissions (if on Linux)

# Then:
npm install dockerode

# Environment:
export DOCKER_HOST=unix:///var/run/docker.sock # Default, usually not needed
```

### Debugging
```bash
# List containers
docker ps

# Follow logs in real-time
docker logs -f dep_1713265800000

# Exec into container
docker exec -it dep_1713265800000 /bin/sh

# Get container stats
docker stats dep_1713265800000
```

### Friday Demo Viability
**YES** ✅ This works for Friday if:
- You run the MCP server on a machine with Docker installed
- Docker daemon is accessible
- `clawdrop/openclaw:latest` image is available locally

---

## OPTION C: HFSP Integration (If Available)

### What It Is
Use the existing HFSP (from Kimi's work) to handle provisioning.

```
Control Plane MCP (this repo)
    ↓ calls HFSP API
HFSP Service (Kimi's responsibility)
    ↓ deploys agent
OpenClaw Runtime Instance
```

### Pros
- ✅ **Kimi has already started this** (HFSP stub exists in repo)
- ✅ **Might be production-ready** (if HFSP is mature)
- ✅ **Decouples provisioning** (separate service)
- ✅ **Could have advanced features** (HA, load balancing, scaling)

### Cons
- ❌ **Unknown capability** (does HFSP actually provision containers?)
- ❌ **Dependency on Kimi** (can't proceed until HFSP is confirmed ready)
- ❌ **Network latency** (HTTP calls to separate service)
- ❌ **More moving parts** (harder to debug)
- ❌ **Might not be ready for Friday** (integration risk)

### Implementation Complexity
```
Difficulty:     Unknown (depends on HFSP API)
Time to build:  0.5 hours (just wire the API call)
Time to debug:  2+ hours (if HFSP has issues)
Production-ready: Maybe
Scalability:    Yes, if HFSP handles it
```

### Example Code

```typescript
// src/provisioner/hfsp-provisioner.ts

import axios from 'axios';
import { IProvisioner, DeployRequest, DeployResponse, DeploymentStatus } from './contract';
import { logger } from '../utils/logger';

export class HFSPProvisioner implements IProvisioner {
  private hfspUrl: string;
  private hfspApiKey: string;

  constructor(
    url: string = process.env.HFSP_URL || 'http://localhost:3001',
    apiKey: string = process.env.HFSP_API_KEY || ''
  ) {
    this.hfspUrl = url;
    this.hfspApiKey = apiKey;
  }

  /**
   * Deploy via HFSP API
   */
  async deploy(req: DeployRequest): Promise<DeployResponse> {
    try {
      logger.info({ deployment_id: req.deployment_id }, 'Deploying via HFSP');

      const response = await axios.post(
        `${this.hfspUrl}/api/v1/agents`,
        {
          deployment_id: req.deployment_id,
          tier_id: req.tier_id,
          region: req.region,
          capability_bundle: req.capability_bundle,
          payment_verified: req.payment_verified,
          wallet_address: req.wallet_address,
          config: req.config,
        },
        {
          headers: {
            Authorization: `Bearer ${this.hfspApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const { agent_id, endpoint, status } = response.data;

      logger.info(
        { deployment_id: req.deployment_id, agent_id, endpoint },
        'HFSP deployment successful'
      );

      return {
        deployment_id: req.deployment_id,
        runtime_instance_id: agent_id,
        status: status || 'provisioning',
        endpoint,
        error: null,
      };
    } catch (error) {
      logger.error(
        { deployment_id: req.deployment_id, error: error.message },
        'HFSP deployment failed'
      );

      return {
        deployment_id: req.deployment_id,
        runtime_instance_id: '',
        status: 'error',
        endpoint: null,
        error: error.message,
      };
    }
  }

  /**
   * Check deployment status via HFSP
   */
  async status(deploymentId: string): Promise<DeploymentStatus> {
    try {
      const response = await axios.get(
        `${this.hfspUrl}/api/v1/agents/${deploymentId}`,
        {
          headers: {
            Authorization: `Bearer ${this.hfspApiKey}`,
          },
          timeout: 10000,
        }
      );

      const { agent_id, status, health, endpoint, capabilities, logs } = response.data;

      return {
        deployment_id: deploymentId,
        runtime_instance_id: agent_id,
        status,
        health,
        endpoint,
        included_capabilities: capabilities || [],
        recent_logs: logs || [],
        error: null,
      };
    } catch (error) {
      logger.error({ deploymentId, error: error.message }, 'HFSP status check failed');

      return {
        deployment_id: deploymentId,
        runtime_instance_id: '',
        status: 'error',
        health: 'failing',
        endpoint: null,
        included_capabilities: [],
        recent_logs: [],
        error: error.message,
      };
    }
  }

  /**
   * Get logs via HFSP
   */
  async logs(deploymentId: string): Promise<string[]> {
    try {
      const response = await axios.get(
        `${this.hfspUrl}/api/v1/agents/${deploymentId}/logs`,
        {
          headers: {
            Authorization: `Bearer ${this.hfspApiKey}`,
          },
          timeout: 10000,
        }
      );

      return response.data.logs || [];
    } catch {
      return [];
    }
  }

  /**
   * Cleanup via HFSP
   */
  async delete(deploymentId: string): Promise<void> {
    try {
      await axios.delete(
        `${this.hfspUrl}/api/v1/agents/${deploymentId}`,
        {
          headers: {
            Authorization: `Bearer ${this.hfspApiKey}`,
          },
          timeout: 10000,
        }
      );
      logger.info({ deploymentId }, 'Agent deleted via HFSP');
    } catch (error) {
      logger.error({ deploymentId, error: error.message }, 'Failed to delete via HFSP');
    }
  }
}

// Usage:
const provisioner = new HFSPProvisioner(
  'https://hfsp.clawdrop.ai',
  process.env.HFSP_API_KEY
);
```

### Setup Requirements
```bash
# Requires HFSP to be running:
1. HFSP service deployed and accessible
2. HFSP API key configured
3. HFSP supports full provisioning (must confirm with Kimi)

# Environment:
export HFSP_URL=http://localhost:3001
export HFSP_API_KEY=sk_test_...
```

### Debugging
```bash
# Check HFSP health
curl http://localhost:3001/health

# Check deployment status
curl -H "Authorization: Bearer $HFSP_API_KEY" \
  http://localhost:3001/api/v1/agents/dep_123

# Check logs
curl -H "Authorization: Bearer $HFSP_API_KEY" \
  http://localhost:3001/api/v1/agents/dep_123/logs
```

### Friday Demo Viability
**UNKNOWN** ⚠️ This depends on:
- Whether HFSP actually supports full provisioning
- Whether Kimi has it ready by Friday morning
- Whether the API is stable enough for demo

**Risk**: If HFSP isn't ready, you'd have no provisioner for Friday.

---

# Decision Matrix: Which Option to Choose?

## For Friday Demo (72 hours away)

| Factor | Option A: SSH | Option B: dockerode | Option C: HFSP |
|--------|--------------|-------------------|-----------------|
| **Time to implement** | 1.5 hours ✅ | 2.5 hours ✅ | 0.5 hours ✅ |
| **Dependencies** | None | dockerode npm | HFSP service |
| **Risk level** | Low ✅ | Low ✅ | **HIGH** ⚠️ |
| **Works locally** | No ❌ | Yes ✅ | Unknown |
| **Works on prod** | Maybe | Yes ✅ | Yes (maybe) |
| **Debugging** | SSH terminal | Docker CLI | HTTP calls |
| **Confidence for Friday** | 95% | 95% | 40% |

---

## Recommendation Breakdown

### If you have SSH access to a server with Docker:
**Choose Option A (SSH + Docker)**
- Fastest to implement
- Most reliable for Friday
- Can always migrate later
- Zero dependencies
- Code: ~100 lines

### If you only have your laptop with Docker:
**Choose Option B (dockerode)**
- Better long-term architecture
- Proper Node.js patterns
- Richer debugging
- Only slightly more complex
- Code: ~200 lines

### If HFSP is confirmed ready:
**Choose Option C (HFSP)**
- But only after Kimi confirms it works
- Get HFSP API spec from Kimi immediately
- Test integration Tuesday evening
- Have fallback (Option A or B) ready

---

# My Strong Recommendation

**Use Option A for Friday, migrate to Option B post-demo.**

### Friday (Option A)
```
✅ Ready in 1.5 hours
✅ Works on any server with Docker
✅ Simple to debug
✅ Can show working demo
✅ Zero external dependencies
```

### Monday (Option B)
```
✅ Cleaner architecture
✅ Better production patterns
✅ Proper error handling
✅ Richer logging
✅ Easier to test
```

**Why not HFSP for Friday?** Because you can't afford the integration risk. If HFSP has issues, you have zero fallback and Friday demo fails. Option A and B are independently viable.

---

# The Critical Questions You Must Answer TODAY

## Question 1: SSH Access to Server?
```
Do you have:
- SSH access to a server?
- That server has Docker installed?
- You can pull clawdrop/openclaw:latest?
```

If YES → Use Option A
If NO → Use Option B (need Docker locally) or Ask Kimi about Option C

## Question 2: Docker Accessibility?
```
Do you have Docker running locally:
- `docker ps` works?
- `/var/run/docker.sock` accessible?
- Can pull images?
```

If YES → Use Option B
If NO → Use Option A (need SSH server)

## Question 3: HFSP Status?
```
Ask Kimi:
- Does HFSP support full container provisioning?
- Is the API stable?
- When will it be ready?
- Can you test it Tuesday?
```

If Kimi says "yes, ready by Tuesday" → Option C could work
If Kimi says "uncertain" → Don't rely on it, use A or B

---

# Decision: Fill This In NOW

Choose one:

```
[ ] Option A: SSH + Docker CLI
    Server: ___________________
    SSH user: __________________
    Ready: Yes/No

[ ] Option B: dockerode locally
    Docker running: Yes/No
    Ready: Yes/No

[ ] Option C: HFSP integration
    Kimi confirmed ready: Yes/No
    API endpoint: ___________________
    Ready: Yes/No

CHOSEN: _____________
```

---

# If You're Still Unsure

**Default recommendation**: Start with **Option A right now**.

1. Do you have a VPS or server with SSH + Docker? If yes → 5 minute setup
2. Don't have one? Spin up a Hetzner VPS ($5/mo) or use an existing server
3. 1.5 hours later → Provisioner working
4. Friday → Demo works

This gives you maximum optionality. You can always migrate to Option B on Monday.

---

# Next: Once You Decide

Come back with your choice, and I'll give you:
1. **Exact setup instructions** for your chosen option
2. **Complete, copy-paste code** ready to integrate
3. **Testing script** to verify it works
4. **Troubleshooting guide** for common issues

