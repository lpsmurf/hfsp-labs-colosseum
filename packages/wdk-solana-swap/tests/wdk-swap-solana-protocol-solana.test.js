// Copyright 2026 Clawdrop <info@hfsp.xyz>
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import test from 'brittle'
import { Keypair } from '@solana/web3.js'
import SolanaSwapProtocol from '../index.js'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SOL_MINT  = 'So11111111111111111111111111111111111111112'
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

const MOCK_QUOTE = {
  inputMint:   SOL_MINT,
  outputMint:  USDT_MINT,
  inAmount:    '1000000000',
  outAmount:   '150000000',
  platformFee: { amount: '0' },
  slippageBps: 50
}

// Real Ed25519 keypair generated once for the test suite
const TEST_KEYPAIR     = Keypair.generate()
const FAKE_PRIVATE_KEY = TEST_KEYPAIR.secretKey

function makeAccount (overrides = {}) {
  return {
    getAddress:      async () => 'FEuTewmn9RdwexQnhvkCq7VaXfpnQL9qsYrTrCgTtk5e',
    keyPair:         { publicKey: new Uint8Array(32), privateKey: FAKE_PRIVATE_KEY },
    sendTransaction: async () => {},
    ...overrides
  }
}

function makeMockConnection () {
  return {
    sendRawTransaction: async () => 'mock-tx-hash-abc123',
    confirmTransaction: async () => ({ value: { err: null } })
  }
}

// Temporarily swap global.fetch; returns a restore function.
function mockFetch (impl) {
  const original = global.fetch
  global.fetch = impl
  return () => { global.fetch = original }
}

function jupiterFetch (quoteBody, swapBody) {
  return async (url) => {
    if (url.startsWith('https://api.jup.ag/swap/v1/quote')) {
      return { ok: true, json: async () => quoteBody }
    }
    if (url.startsWith('https://api.jup.ag/swap/v1/swap')) {
      return { ok: true, json: async () => swapBody }
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }
}

// ─── quoteSwap ───────────────────────────────────────────────────────────────

test('quoteSwap - returns fee/tokenInAmount/tokenOutAmount (ExactIn)', async (t) => {
  let capturedUrl
  const restore = mockFetch(async (url) => {
    capturedUrl = url
    return { ok: true, json: async () => MOCK_QUOTE }
  })

  const protocol = new SolanaSwapProtocol(makeAccount())
  const result = await protocol.quoteSwap({
    tokenIn:       SOL_MINT,
    tokenOut:      USDT_MINT,
    tokenInAmount: 1_000_000_000n
  })

  t.is(result.tokenInAmount,  1_000_000_000n, 'tokenInAmount matches inAmount')
  t.is(result.tokenOutAmount, 150_000_000n,   'tokenOutAmount matches outAmount')
  t.is(result.fee,            0n,             'fee is zero when platformFee.amount is 0')
  t.ok(capturedUrl.includes('swapMode=ExactIn'),         'uses ExactIn mode')
  t.ok(capturedUrl.includes(`inputMint=${SOL_MINT}`),    'passes correct inputMint')
  t.ok(capturedUrl.includes(`outputMint=${USDT_MINT}`),  'passes correct outputMint')
  restore()
})

test('quoteSwap - uses ExactOut when tokenOutAmount is provided', async (t) => {
  let capturedUrl
  const restore = mockFetch(async (url) => {
    capturedUrl = url
    return { ok: true, json: async () => MOCK_QUOTE }
  })

  const protocol = new SolanaSwapProtocol(makeAccount())
  await protocol.quoteSwap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT, tokenOutAmount: 150_000_000n })

  t.ok(capturedUrl.includes('swapMode=ExactOut'), 'uses ExactOut mode')
  restore()
})

test('quoteSwap - passes configured slippageBps to Jupiter', async (t) => {
  let capturedUrl
  const restore = mockFetch(async (url) => {
    capturedUrl = url
    return { ok: true, json: async () => MOCK_QUOTE }
  })

  const protocol = new SolanaSwapProtocol(makeAccount(), { slippageBps: 100 })
  await protocol.quoteSwap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT, tokenInAmount: 1n })

  t.ok(capturedUrl.includes('slippageBps=100'), 'passes custom slippageBps')
  restore()
})

test('quoteSwap - throws when neither tokenInAmount nor tokenOutAmount is given', async (t) => {
  const protocol = new SolanaSwapProtocol(makeAccount())
  await t.exception(
    () => protocol.quoteSwap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT }),
    /Either tokenInAmount or tokenOutAmount must be provided/
  )
})

test('quoteSwap - throws on Jupiter API error', async (t) => {
  const restore = mockFetch(async () => ({
    ok: false, status: 400, text: async () => 'bad request'
  }))

  const protocol = new SolanaSwapProtocol(makeAccount())
  await t.exception(
    () => protocol.quoteSwap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT, tokenInAmount: 1n }),
    /Jupiter quote error \(400\)/
  )
  restore()
})

test('quoteSwap - returns non-zero fee from platformFee.amount', async (t) => {
  const restore = mockFetch(async () => ({
    ok: true,
    json: async () => ({ ...MOCK_QUOTE, platformFee: { amount: '5000' } })
  }))

  const protocol = new SolanaSwapProtocol(makeAccount())
  const result = await protocol.quoteSwap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT, tokenInAmount: 1n })

  t.is(result.fee, 5000n, 'fee reflects platformFee.amount')
  restore()
})

// ─── swap ────────────────────────────────────────────────────────────────────

test('swap - throws immediately when account has no private key', async (t) => {
  // No fetch mock needed — private key check happens before any network call
  const account  = makeAccount({ keyPair: { publicKey: new Uint8Array(32), privateKey: null } })
  const protocol = new SolanaSwapProtocol(account)

  await t.exception(
    () => protocol.swap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT, tokenInAmount: 1_000_000_000n }),
    /private key unavailable/
  )
})

test('swap - throws when swap fee exceeds swapMaxFee', async (t) => {
  const restore = mockFetch(async (url) => {
    if (url.startsWith('https://api.jup.ag/swap/v1/quote')) {
      return { ok: true, json: async () => ({ ...MOCK_QUOTE, platformFee: { amount: '10000' } }) }
    }
    throw new Error('should not reach swap endpoint')
  })

  const protocol = new SolanaSwapProtocol(makeAccount(), { swapMaxFee: 100n })
  await t.exception(
    () => protocol.swap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT, tokenInAmount: 1_000_000_000n }),
    /exceeds swapMaxFee/
  )
  restore()
})

test('swap - throws on Jupiter swap API error', async (t) => {
  const restore = mockFetch(async (url) => {
    if (url.startsWith('https://api.jup.ag/swap/v1/quote')) {
      return { ok: true, json: async () => MOCK_QUOTE }
    }
    return { ok: false, status: 500, text: async () => 'internal error' }
  })

  const protocol = new SolanaSwapProtocol(makeAccount())
  await t.exception(
    () => protocol.swap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT, tokenInAmount: 1_000_000_000n }),
    /Jupiter swap error \(500\)/
  )
  restore()
})

test('swap - returns hash and amounts on success', async (t) => {
  const { VersionedTransaction, Message } = await import('@solana/web3.js')

  // The signer's public key must appear as a required signer in the transaction's account list.
  const signerAddress = TEST_KEYPAIR.publicKey.toBase58()

  const msg = new Message({
    header: {
      numRequiredSignatures:       1,
      numReadonlySignedAccounts:   0,
      numReadonlyUnsignedAccounts: 0
    },
    accountKeys:     [signerAddress],
    recentBlockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N',
    instructions:    []
  })
  // Legacy wire format: [numSignatures varint, ...signature(64 bytes), ...message]
  const wire      = Buffer.from([1, ...new Uint8Array(64), ...msg.serialize()])
  const fakeTxB64 = Buffer.from(VersionedTransaction.deserialize(wire).serialize()).toString('base64')

  const account = makeAccount({
    getAddress: async () => signerAddress,
    keyPair:    { publicKey: TEST_KEYPAIR.publicKey.toBytes(), privateKey: TEST_KEYPAIR.secretKey }
  })

  const restore  = mockFetch(jupiterFetch(MOCK_QUOTE, { swapTransaction: fakeTxB64 }))
  const protocol = new SolanaSwapProtocol(account, { _connection: makeMockConnection() })

  const result = await protocol.swap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT, tokenInAmount: 1_000_000_000n })

  t.is(result.hash,           'mock-tx-hash-abc123', 'returns tx hash from connection')
  t.is(result.tokenInAmount,  1_000_000_000n,        'tokenInAmount')
  t.is(result.tokenOutAmount, 150_000_000n,           'tokenOutAmount')
  t.is(result.fee,            0n,                    'fee')
  restore()
})
