// CJS shim for uuid (v14 is ESM-only and breaks Jest). Only v1/v4 are used
// by @solana/web3.js's rpc-websockets for socket IDs.
const { randomUUID } = require('crypto');
let seq = 0;
module.exports = {
  v1: () => `jest-${Date.now().toString(16)}-${(seq++).toString(16)}`,
  v4: randomUUID,
};
