// Mock @solana/web3.js for unit tests — avoids ESM/CJS conflict

export class Connection {
  constructor () {}
  async sendRawTransaction () { return 'mock-tx-hash-abc123' }
  async confirmTransaction () { return { value: { err: null } } }
}

export class Keypair {
  static fromSecretKey (key) {
    return { publicKey: { toBuffer: () => Buffer.alloc(32) }, secretKey: key }
  }
  static generate () {
    return { publicKey: { toBuffer: () => Buffer.alloc(32) }, secretKey: new Uint8Array(64) }
  }
}

export class VersionedTransaction {
  static deserialize (buf) {
    return new VersionedTransaction()
  }
  sign (signers) {}
  serialize () { return Buffer.alloc(100) }
}

export class PublicKey {
  constructor (key) { this._key = key }
  toString () { return this._key }
  toBuffer () { return Buffer.alloc(32) }
}
