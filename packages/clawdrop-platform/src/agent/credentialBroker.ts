import { createHash, randomBytes } from 'crypto';
import type { CredentialMap } from './dockerService.js';

export interface CredentialLease {
  token: string;
  expiresAt: number;
}

type StoredCredentialLease = {
  agentId: string;
  credentials: CredentialMap;
  expiresAt: number;
  timeout: NodeJS.Timeout;
};

const DEFAULT_LEASE_TTL_MS = 60_000;
const leases = new Map<string, StoredCredentialLease>();

export function createCredentialLease(agentId: string, credentials: CredentialMap): CredentialLease {
  purgeExpiredCredentialLeases();

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = Date.now() + getLeaseTtlMs();
  const storedCredentials = copyCredentials(credentials);
  const timeout = setTimeout(() => {
    revokeCredentialLeaseByHash(tokenHash);
  }, Math.max(expiresAt - Date.now(), 1));
  timeout.unref();

  leases.set(tokenHash, {
    agentId,
    credentials: storedCredentials,
    expiresAt,
    timeout,
  });

  return { token, expiresAt };
}

export function redeemCredentialLease(agentId: string, token: string): CredentialMap | null {
  purgeExpiredCredentialLeases();

  const tokenHash = hashToken(token);
  const lease = leases.get(tokenHash);
  if (!lease || lease.agentId !== agentId || lease.expiresAt <= Date.now()) {
    if (lease) revokeCredentialLeaseByHash(tokenHash);
    return null;
  }

  leases.delete(tokenHash);
  clearTimeout(lease.timeout);

  const credentials = copyCredentials(lease.credentials);
  clearCredentialMap(lease.credentials);
  return credentials;
}

export function revokeCredentialLease(token: string): void {
  revokeCredentialLeaseByHash(hashToken(token));
}

export function getCredentialLeaseCount(): number {
  purgeExpiredCredentialLeases();
  return leases.size;
}

function revokeCredentialLeaseByHash(tokenHash: string): void {
  const lease = leases.get(tokenHash);
  if (!lease) return;

  leases.delete(tokenHash);
  clearTimeout(lease.timeout);
  clearCredentialMap(lease.credentials);
}

function purgeExpiredCredentialLeases(): void {
  const now = Date.now();
  for (const [tokenHash, lease] of leases.entries()) {
    if (lease.expiresAt <= now) {
      revokeCredentialLeaseByHash(tokenHash);
    }
  }
}

function copyCredentials(credentials: CredentialMap): CredentialMap {
  return Object.fromEntries(
    Object.entries(credentials)
      .filter(([key]) => key !== 'SKILL_NAME')
      .map(([key, value]) => [key, value]),
  );
}

function clearCredentialMap(credentials: CredentialMap): void {
  for (const key of Object.keys(credentials)) {
    credentials[key] = '';
    delete credentials[key];
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function getLeaseTtlMs(): number {
  const configured = Number.parseInt(process.env.ZK_CREDENTIAL_LEASE_TTL_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_LEASE_TTL_MS;
}
