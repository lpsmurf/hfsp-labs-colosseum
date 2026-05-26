import { gcm } from '@noble/ciphers/aes.js'
import type { CredentialMap, DerivedCredentialKey, EncryptedCredentials } from './types'

const NONCE_BYTES = 12
const KEY_BYTES = 32
const SALT_BYTES = 32
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export class CredentialDecryptionError extends Error {
  constructor() {
    super('Credential decryption failed')
    this.name = 'CredentialDecryptionError'
  }
}

export async function encryptCredentials(
  credentials: CredentialMap,
  key: DerivedCredentialKey,
  salt: Uint8Array,
): Promise<EncryptedCredentials> {
  assertCredentialMap(credentials)
  assertKey(key)
  assertSalt(salt)

  const nonce = randomNonce()
  const plaintext = textEncoder.encode(JSON.stringify(sortCredentials(credentials)))
  const ciphertext = gcm(key, nonce).encrypt(plaintext)

  return {
    ciphertext,
    nonce,
    salt,
  }
}

export async function decryptCredentials(
  encrypted: EncryptedCredentials,
  key: DerivedCredentialKey,
): Promise<CredentialMap> {
  assertEncryptedCredentials(encrypted)
  assertKey(key)

  try {
    const plaintext = gcm(key, encrypted.nonce).decrypt(encrypted.ciphertext)
    const decoded = textDecoder.decode(plaintext)
    const parsed = JSON.parse(decoded) as unknown

    assertCredentialMap(parsed)
    return parsed
  } catch {
    throw new CredentialDecryptionError()
  }
}

function randomNonce(): Uint8Array {
  const crypto = globalThis.crypto
  if (!crypto?.getRandomValues) {
    throw new Error('Secure random source is unavailable')
  }

  const nonce = new Uint8Array(NONCE_BYTES)
  crypto.getRandomValues(nonce)
  return nonce
}

function sortCredentials(credentials: CredentialMap): CredentialMap {
  return Object.keys(credentials)
    .sort()
    .reduce<CredentialMap>((sorted, key) => {
      sorted[key] = credentials[key]
      return sorted
    }, {})
}

function assertKey(key: Uint8Array): void {
  if (key.byteLength !== KEY_BYTES) {
    throw new Error('Credential key must be 32 bytes')
  }
}

function assertSalt(salt: Uint8Array): void {
  if (salt.byteLength !== SALT_BYTES) {
    throw new Error('Vault salt must be 32 bytes')
  }
}

function assertEncryptedCredentials(encrypted: EncryptedCredentials): void {
  if (!(encrypted.ciphertext instanceof Uint8Array) || encrypted.ciphertext.byteLength === 0) {
    throw new Error('Encrypted credentials ciphertext is required')
  }

  if (!(encrypted.nonce instanceof Uint8Array) || encrypted.nonce.byteLength !== NONCE_BYTES) {
    throw new Error('Encrypted credentials nonce must be 12 bytes')
  }

  assertSalt(encrypted.salt)
}

function assertCredentialMap(value: unknown): asserts value is CredentialMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Credentials must be a key-value object')
  }

  for (const [key, credential] of Object.entries(value)) {
    if (!key.trim()) {
      throw new Error('Credential names cannot be empty')
    }

    if (typeof credential !== 'string') {
      throw new Error('Credential values must be strings')
    }
  }
}
