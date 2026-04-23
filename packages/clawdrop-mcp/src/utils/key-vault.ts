/**
 * key-vault.ts — Secure key retrieval with defense-in-depth
 *
 * Priority order:
 *   1. Runtime secret (passed directly, e.g. from Vault/KMS at startup)
 *   2. Environment variable (dev/staging)
 *   3. Crash with a clear error — never silently fall back to empty
 *
 * Rules enforced here:
 *   - Keys are NEVER logged (redacted in all output)
 *   - Keys are accessed only when needed (lazy, not at module load)
 *   - In production: env var must be present or process exits
 */

import logger from './logger';

type SecretName = 'CLAWDROP_WALLET_PRIVATE_KEY' | 'HFSP_API_KEY' | 'HELIUS_API_KEY';

// In-memory runtime secrets — set at process start from a secure source
// (e.g. fetched from HashiCorp Vault, AWS SSM, injected by container orchestrator)
const runtimeSecrets = new Map<SecretName, string>();

/**
 * Register a secret at startup (e.g. fetched from Vault).
 * Takes precedence over env vars.
 */
export function registerSecret(name: SecretName, value: string): void {
  if (!value) throw new Error(`Cannot register empty secret: ${name}`);
  runtimeSecrets.set(name, value);
  logger.info({ secret: name }, 'Runtime secret registered');
}

/**
 * Get a secret by name.
 * In production: crashes if missing.
 * In dev/test: warns and falls through.
 */
export function getSecret(name: SecretName): string {
  // 1. Runtime (Vault/KMS)
  const runtime = runtimeSecrets.get(name);
  if (runtime) return runtime;

  // 2. Environment variable
  const envValue = process.env[name];
  if (envValue && envValue !== 'YOUR_SOLANA_WALLET_HERE' && envValue !== 'demo') {
    return envValue;
  }

  // 3. Hard fail in production
  if (process.env.NODE_ENV === 'production') {
    logger.error({ secret: name }, 'Required secret missing in production — shutting down');
    process.exit(1);
  }

  // Dev: warn but continue with empty (some secrets optional in dev)
  logger.warn({ secret: name }, 'Secret not set — using empty value (dev mode only)');
  return '';
}

/**
 * Redact a sensitive string for safe logging.
 * Shows first 4 + last 4 chars only.
 */
export function redact(value: string): string {
  if (!value || value.length < 12) return '***';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

/**
 * Validate that a Solana wallet address looks correct.
 * Base58, 32–44 chars.
 */
export function validateSolanaAddress(address: string, field = 'wallet'): void {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    throw new Error(`Invalid Solana address for ${field}: must be base58, 32-44 chars`);
  }
}

/**
 * Check that all required production secrets are present.
 * Call this at server startup.
 */
export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const required: SecretName[] = ['HFSP_API_KEY', 'HELIUS_API_KEY'];
  const missing = required.filter(name => !getSecret(name));

  if (missing.length > 0) {
    logger.error({ missing }, 'Missing required production secrets');
    process.exit(1);
  }

  logger.info('All required secrets present');
}
