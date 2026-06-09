import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import SolanaSwapProtocol from '../index.js'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

const MOCK_QUOTE = {
  inputMint: SOL_MINT,
  outputMint: USDT_MINT,
  inAmount: '1000000000',
  outAmount: '150000000',
  platformFee: { amount: '0' },
  slippageBps: 50
}

// 64-byte fake private key (zeroed — only used for Keypair.fromSecretKey in unit tests)
const FAKE_PRIVATE_KEY = new Uint8Array(64)

function makeAccount (overrides = {}) {
  return {
    getAddress: jest.fn().mockResolvedValue('FEuTewmn9RdwexQnhvkCq7VaXfpnQL9qsYrTrCgTtk5e'),
    keyPair: { publicKey: new Uint8Array(32), privateKey: FAKE_PRIVATE_KEY },
    sendTransaction: jest.fn(),
    ...overrides
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockFetch (quoteBody, swapBody) {
  let callCount = 0
  global.fetch = jest.fn().mockImplementation(async (url) => {
    if (url.startsWith('https://quote-api.jup.ag/v6/quote')) {
      return { ok: true, json: async () => quoteBody }
    }
    if (url.startsWith('https://quote-api.jup.ag/v6/swap')) {
      return { ok: true, json: async () => swapBody }
    }
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SolanaSwapProtocol', () => {
  describe('quoteSwap', () => {
    test('returns fee/tokenInAmount/tokenOutAmount from Jupiter quote (ExactIn)', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => MOCK_QUOTE })

      const protocol = new SolanaSwapProtocol(makeAccount())
      const result = await protocol.quoteSwap({
        tokenIn: SOL_MINT,
        tokenOut: USDT_MINT,
        tokenInAmount: 1_000_000_000n
      })

      expect(result.tokenInAmount).toBe(1_000_000_000n)
      expect(result.tokenOutAmount).toBe(150_000_000n)
      expect(result.fee).toBe(0n)

      const url = global.fetch.mock.calls[0][0]
      expect(url).toContain('swapMode=ExactIn')
      expect(url).toContain(`inputMint=${SOL_MINT}`)
    })

    test('uses ExactOut when tokenOutAmount is provided', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => MOCK_QUOTE })

      const protocol = new SolanaSwapProtocol(makeAccount())
      await protocol.quoteSwap({
        tokenIn: SOL_MINT,
        tokenOut: USDT_MINT,
        tokenOutAmount: 150_000_000n
      })

      const url = global.fetch.mock.calls[0][0]
      expect(url).toContain('swapMode=ExactOut')
    })

    test('throws if neither tokenInAmount nor tokenOutAmount is given', async () => {
      const protocol = new SolanaSwapProtocol(makeAccount())
      await expect(
        protocol.quoteSwap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT })
      ).rejects.toThrow('Either tokenInAmount or tokenOutAmount must be provided')
    })

    test('throws on Jupiter API error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'bad request'
      })

      const protocol = new SolanaSwapProtocol(makeAccount())
      await expect(
        protocol.quoteSwap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT, tokenInAmount: 1n })
      ).rejects.toThrow('Jupiter quote error (400)')
    })
  })

  describe('swap', () => {
    // Minimal valid versioned transaction bytes (just enough to deserialize)
    // In real tests this would be a proper serialized VersionedTransaction.
    // We mock the Connection to skip actual RPC calls.
    const FAKE_TX_B64 = Buffer.alloc(1).toString('base64')

    function setupSwapMocks (quoteOverride = {}) {
      const quote = { ...MOCK_QUOTE, ...quoteOverride }
      global.fetch = jest.fn().mockImplementation(async (url) => {
        if (url.startsWith('https://quote-api.jup.ag/v6/quote')) {
          return { ok: true, json: async () => quote }
        }
        return { ok: true, json: async () => ({ swapTransaction: FAKE_TX_B64 }) }
      })
    }

    test('throws if account has no private key', async () => {
      setupSwapMocks()

      const account = makeAccount({ keyPair: { publicKey: new Uint8Array(32), privateKey: null } })
      const protocol = new SolanaSwapProtocol(account)

      await expect(
        protocol.swap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT, tokenInAmount: 1_000_000_000n })
      ).rejects.toThrow('private key unavailable')
    })

    test('throws when swap fee exceeds swapMaxFee', async () => {
      setupSwapMocks({ platformFee: { amount: '10000' } })

      const protocol = new SolanaSwapProtocol(makeAccount(), { swapMaxFee: 100n })

      await expect(
        protocol.swap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT, tokenInAmount: 1_000_000_000n })
      ).rejects.toThrow('exceeds swapMaxFee')
    })

    test('throws on Jupiter swap API error', async () => {
      global.fetch = jest.fn().mockImplementation(async (url) => {
        if (url.startsWith('https://quote-api.jup.ag/v6/quote')) {
          return { ok: true, json: async () => MOCK_QUOTE }
        }
        return { ok: false, status: 500, text: async () => 'internal error' }
      })

      const protocol = new SolanaSwapProtocol(makeAccount())
      await expect(
        protocol.swap({ tokenIn: SOL_MINT, tokenOut: USDT_MINT, tokenInAmount: 1_000_000_000n })
      ).rejects.toThrow('Jupiter swap error (500)')
    })
  })
})
