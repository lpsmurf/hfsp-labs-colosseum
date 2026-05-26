export type CredentialMap = Record<string, string>

export interface EncryptedCredentials {
  /**
   * AES-GCM output from @noble/ciphers. The authentication tag is appended to
   * this byte array by the library and verified during decryption.
   */
  ciphertext: Uint8Array
  nonce: Uint8Array
  salt: Uint8Array
}

export interface VaultEntry {
  id: string
  userPubkey: string
  agentId: string
  encryptedBlob: Uint8Array
  nonce: Uint8Array
  salt: Uint8Array
  createdAt: number
  updatedAt: number
}

export type AuditAction = 'store' | 'spawn' | 'revoke' | 'update'

export interface AuditEntry {
  id: string
  userPubkey: string
  agentId: string
  action: AuditAction
  ipAddress?: string
  timestamp: number
}

export type DerivedCredentialKey = Uint8Array
