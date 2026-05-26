import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import type { DerivedCredentialKey } from './types'

export const CREDENTIAL_KEY_BYTES = 32
export const CREDENTIAL_SALT_BYTES = 32
export const WALLET_SIGNATURE_BYTES = 64
export const HKDF_INFO_PREFIX = 'clawdrop-vault-v1:'

const textEncoder = new TextEncoder()

export function buildCredentialVaultMessage(agentId: string, publicKey: string): string {
  const normalizedAgentId = agentId.trim()
  const normalizedPublicKey = publicKey.trim()

  if (!normalizedAgentId) {
    throw new Error('Agent id is required for credential vault signing')
  }

  if (!normalizedPublicKey) {
    throw new Error('Wallet public key is required for credential vault signing')
  }

  return [
    'Clawdrop credential vault access \u2014 v1',
    `Agent: ${normalizedAgentId}`,
    `Wallet: ${normalizedPublicKey}`,
  ].join('\n')
}

export function generateVaultSalt(): Uint8Array {
  const crypto = globalThis.crypto
  if (!crypto?.getRandomValues) {
    throw new Error('Secure random source is unavailable')
  }

  const salt = new Uint8Array(CREDENTIAL_SALT_BYTES)
  crypto.getRandomValues(salt)
  return salt
}

export async function deriveKey(
  walletSignature: Uint8Array,
  salt: Uint8Array,
  agentId: string,
): Promise<DerivedCredentialKey> {
  const normalizedAgentId = agentId.trim()

  if (walletSignature.byteLength !== WALLET_SIGNATURE_BYTES) {
    throw new Error('Wallet signature must be 64 bytes')
  }

  if (salt.byteLength !== CREDENTIAL_SALT_BYTES) {
    throw new Error('Vault salt must be 32 bytes')
  }

  if (!normalizedAgentId) {
    throw new Error('Agent id is required for key derivation')
  }

  const info = textEncoder.encode(`${HKDF_INFO_PREFIX}${normalizedAgentId}`)
  return hkdf(sha256, walletSignature, salt, info, CREDENTIAL_KEY_BYTES)
}
