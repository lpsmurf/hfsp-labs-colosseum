// AES-GCM keystore for seed phrase encryption.
// Uses Web Crypto API — available in service workers and browser contexts.

const PBKDF2_ITERATIONS = 200_000
const KEY_LENGTH = 256

async function deriveKey (password, salt) {
  const raw = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    raw,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encrypt (plaintext, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const data = new TextEncoder().encode(plaintext)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  return {
    salt: Array.from(salt),
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(cipher))
  }
}

export async function decrypt (blob, password) {
  const { salt, iv, ciphertext } = blob
  const key = await deriveKey(password, new Uint8Array(salt))
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    new Uint8Array(ciphertext)
  )
  return new TextDecoder().decode(plain)
}
