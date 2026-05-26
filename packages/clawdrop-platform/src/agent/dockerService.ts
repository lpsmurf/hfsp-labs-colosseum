import Docker from 'dockerode';
import { existsSync } from 'fs';
import { createCredentialLease, revokeCredentialLease } from './credentialBroker.js';

export type CredentialMap = Record<string, string>;

export interface StopContainerResult {
  containerId: string | null;
  found: boolean;
  stopped: boolean;
  killed: boolean;
  alreadyStopped: boolean;
}

const docker = createDockerClient();
const DEFAULT_AGENT_IMAGE = 'clawdrop/agent-base:latest';
const DEFAULT_AGENT_ENDPOINT_HOST = 'clawdrop.live';
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const DOCKER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

export async function spawnContainer(
  agentId: string,
  credentials: CredentialMap,
  skillName: string,
): Promise<string> {
  const normalizedAgentId = normalizeAgentId(agentId);
  const normalizedSkillName = normalizeSkillName(skillName);
  const containerName = `zk-agent-${normalizedAgentId}`;
  const image = process.env.ZK_AGENT_IMAGE ?? DEFAULT_AGENT_IMAGE;
  assertCredentialMap(credentials);
  const lease = createCredentialLease(normalizedAgentId, credentials);
  const env = buildBootstrapEnv(normalizedAgentId, normalizedSkillName, lease);
  const cmd = parseCommand(process.env.ZK_AGENT_COMMAND);

  let container: Docker.Container | undefined;
  try {
    await removeExistingContainer(containerName);

    const createOptions: Docker.ContainerCreateOptions = {
      Image: image,
      name: containerName,
      Env: env,
      Cmd: cmd,
      Labels: {
        'clawdrop.agent_id': normalizedAgentId,
        'clawdrop.spawn_mode': 'zk-vault',
      },
      HostConfig: {
        RestartPolicy: { Name: 'unless-stopped' },
        LogConfig: { Type: 'none', Config: {} },
        ExtraHosts: ['host.docker.internal:host-gateway'],
      },
    };

    container = await docker.createContainer(createOptions) as Docker.Container;

    await container.start();
    return container.id;
  } catch (error) {
    revokeCredentialLease(lease.token);
    if (container) {
      await container.remove({ force: true }).catch(() => {});
    }
    throw error;
  }
}

export function buildAgentEndpoint(agentId: string): string {
  const host = process.env.ZK_AGENT_ENDPOINT_HOST ?? DEFAULT_AGENT_ENDPOINT_HOST;
  const subdomain = normalizeAgentId(agentId).toLowerCase();
  return `https://agent-${subdomain}.${host}`;
}

// AUDIT: HIGH — Volume leak on revoke. stopContainerForAgent only stops the container;
// it does not remove it or prune orphaned named volumes. On agent revocation, the
// container and its volumes may be left behind. Consider adding removeContainerForAgent()
// that inspects the container, retrieves its Mounts, removes the container, then prunes
// the named volumes that are no longer referenced.
export async function stopContainerForAgent(
  agentId: string,
  containerId?: string | null,
): Promise<StopContainerResult> {
  const normalizedAgentId = normalizeAgentId(agentId);
  const container = await resolveContainer(normalizedAgentId, containerId);

  if (!container) {
    return {
      containerId: null,
      found: false,
      stopped: false,
      killed: false,
      alreadyStopped: false,
    };
  }

  const before = await inspectContainer(container);
  const resolvedContainerId = before?.Id ?? container.id;
  if (!before?.State?.Running) {
    return {
      containerId: resolvedContainerId,
      found: true,
      stopped: false,
      killed: false,
      alreadyStopped: true,
    };
  }

  let stopped = false;
  let killed = false;

  try {
    await container.stop({ t: 5 });
    stopped = true;
  } catch {
    // If graceful stop fails or times out, inspect below and force kill if needed.
  }

  const afterStop = await inspectContainer(container);
  if (afterStop?.State?.Running) {
    await container.kill();
    killed = true;
  }

  return {
    containerId: resolvedContainerId,
    found: true,
    stopped,
    killed,
    alreadyStopped: false,
  };
}

function buildBootstrapEnv(
  agentId: string,
  skillName: string,
  lease: { token: string; expiresAt: number },
): string[] {
  return [
    `CLAWDROP_AGENT_ID=${agentId}`,
    `CLAWDROP_SKILL_NAME=${skillName}`,
    `CLAWDROP_CREDENTIALS_URL=${buildCredentialBrokerUrl(agentId)}`,
    `CLAWDROP_CREDENTIALS_TOKEN=${lease.token}`,
    `CLAWDROP_CREDENTIALS_EXPIRES_AT=${lease.expiresAt}`,
  ];
}

function assertCredentialMap(credentials: CredentialMap): void {
  for (const [rawKey, value] of Object.entries(credentials)) {
    const key = rawKey.trim();
    if (key === 'SKILL_NAME') continue;
    assertEnvKey(key);

    if (typeof value !== 'string') {
      throw new Error(`Credential ${key} must be a string`);
    }

  }
}

async function removeExistingContainer(containerName: string): Promise<void> {
  try {
    const container = docker.getContainer(containerName);
    await container.remove({ force: true });
  } catch {
    // No existing container to remove.
  }
}

async function resolveContainer(agentId: string, containerId?: string | null): Promise<Docker.Container | null> {
  const explicitId = containerId?.trim();
  if (explicitId) {
    const explicit = docker.getContainer(explicitId);
    if (await inspectContainer(explicit)) {
      return explicit;
    }
  }

  const named = docker.getContainer(`zk-agent-${agentId}`);
  if (await inspectContainer(named)) {
    return named;
  }

  const matches = await docker.listContainers({
    all: true,
    filters: {
      label: [`clawdrop.agent_id=${agentId}`, 'clawdrop.spawn_mode=zk-vault'],
    },
  });

  const match = matches[0];
  return match ? docker.getContainer(match.Id) : null;
}

async function inspectContainer(container: Docker.Container): Promise<Docker.ContainerInspectInfo | null> {
  try {
    return await container.inspect();
  } catch {
    return null;
  }
}

function normalizeAgentId(agentId: string): string {
  const normalized = agentId.trim();
  if (!DOCKER_NAME_PATTERN.test(normalized)) {
    throw new Error('Invalid agent id for Docker container name');
  }

  return normalized;
}

function normalizeSkillName(skillName: string): string {
  const normalized = skillName.trim();
  if (!normalized || normalized.length > 128) {
    throw new Error('Skill name is required');
  }

  return normalized;
}

function assertEnvKey(key: string): void {
  if (!ENV_NAME_PATTERN.test(key)) {
    throw new Error(`Invalid credential environment variable name: ${key}`);
  }
}

function parseCommand(command: string | undefined): string[] | undefined {
  if (!command?.trim()) return undefined;
  return command.split(',').map((part) => part.trim()).filter(Boolean);
}

function buildCredentialBrokerUrl(agentId: string): string {
  const baseUrl = process.env.ZK_CREDENTIAL_BROKER_BASE_URL
    ?? `http://host.docker.internal:${process.env.PORT ?? '8788'}`;
  return `${baseUrl.replace(/\/+$/, '')}/internal/agent-credentials/${encodeURIComponent(agentId)}/redeem`;
}

function createDockerClient(): Docker {
  const socketPath = process.env.DOCKER_SOCKET_PATH
    ?? parseDockerHostSocket(process.env.DOCKER_HOST)
    ?? getDockerDesktopSocketPath();

  return socketPath ? new Docker({ socketPath }) : new Docker();
}

function parseDockerHostSocket(dockerHost: string | undefined): string | null {
  if (!dockerHost?.startsWith('unix://')) return null;
  return dockerHost.slice('unix://'.length);
}

function getDockerDesktopSocketPath(): string | null {
  const home = process.env.HOME;
  if (!home) return null;

  const socketPath = `${home}/.docker/run/docker.sock`;
  return existsSync(socketPath) ? socketPath : null;
}
