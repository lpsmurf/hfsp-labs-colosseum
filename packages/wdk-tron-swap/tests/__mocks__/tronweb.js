// Mock tronweb for unit tests — avoids network and native dependency issues

export default class TronWeb {
  constructor (opts) {
    this._opts = opts
    this.address = {
      toHex: (addr) => '41' + addr.slice(1)
    }
    this.trx = {
      sign: async (tx, key) => ({ ...tx, signature: ['mocksig'] }),
      sendRawTransaction: async (tx) => ({ result: true, txid: 'mock-tron-txid-abc123' })
    }
    this.transactionBuilder = {
      triggerSmartContract: async (contract, method, opts, params, issuer) => ({
        transaction: {
          txID: 'mock-txid-hex-abc123',
          raw_data: { contract: [], ref_block_bytes: '0000', timestamp: Date.now() }
        },
        result: { result: true }
      })
    }
  }
}
