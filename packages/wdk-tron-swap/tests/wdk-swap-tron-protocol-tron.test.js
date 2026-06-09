import { beforeEach, describe, expect, jest, test } from '@jest/globals'
import TronSwapProtocol from '../index.js'

const TRX = 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR'
const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

const MOCK_ROUTE = {
  amountIn: '1000000',
  amountOut: '998500',
  fee: '1500',
  tokens: [TRX, USDT],
  poolVersions: ['v2']
}

function makeAccount (hasPrivateKey = true) {
  return {
    getAddress: jest.fn().mockResolvedValue('TAddr123'),
    keyPair: hasPrivateKey
      ? { privateKey: new Uint8Array(32).fill(1), publicKey: new Uint8Array(32).fill(2) }
      : null
  }
}

function mockFetch (body, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    json: async () => body,
    text: async () => JSON.stringify(body)
  })
}

describe('TronSwapProtocol', () => {
  let account, protocol

  beforeEach(() => {
    account = makeAccount()
    protocol = new TronSwapProtocol(account)
  })

  describe('quoteSwap', () => {
    test('returns quote for ExactIn swap', async () => {
      mockFetch(MOCK_ROUTE)
      const quote = await protocol.quoteSwap({ tokenIn: TRX, tokenOut: USDT, tokenInAmount: 1000000n })
      expect(quote.tokenInAmount).toBe(1000000n)
      expect(quote.tokenOutAmount).toBe(998500n)
      expect(quote.fee).toBe(1500n)
    })

    test('throws when tokenInAmount is not provided', async () => {
      await expect(
        protocol.quoteSwap({ tokenIn: TRX, tokenOut: USDT })
      ).rejects.toThrow('tokenInAmount is required')
    })

    test('throws on SunSwap router API error', async () => {
      mockFetch({ error: 'bad request' }, false)
      await expect(
        protocol.quoteSwap({ tokenIn: TRX, tokenOut: USDT, tokenInAmount: 1000000n })
      ).rejects.toThrow('SunSwap router error')
    })

    test('handles decimal amountOut strings from API', async () => {
      mockFetch({ ...MOCK_ROUTE, amountOut: '998500.0', fee: '0.0' })
      const quote = await protocol.quoteSwap({ tokenIn: TRX, tokenOut: USDT, tokenInAmount: 1000000n })
      expect(quote.tokenOutAmount).toBe(998500n)
      expect(quote.fee).toBe(0n)
    })
  })

  describe('swap', () => {
    test('executes swap and returns hash', async () => {
      mockFetch(MOCK_ROUTE)
      const result = await protocol.swap({ tokenIn: TRX, tokenOut: USDT, tokenInAmount: 1000000n })
      expect(result.hash).toBe('mock-tron-txid-abc123')
      expect(result.tokenInAmount).toBe(1000000n)
      expect(result.tokenOutAmount).toBe(998500n)
    })

    test('throws when account has no private key', async () => {
      protocol = new TronSwapProtocol(makeAccount(false))
      await expect(
        protocol.swap({ tokenIn: TRX, tokenOut: USDT, tokenInAmount: 1000000n })
      ).rejects.toThrow('Account private key unavailable')
    })

    test('throws when fee exceeds swapMaxFee', async () => {
      mockFetch(MOCK_ROUTE)
      protocol = new TronSwapProtocol(account, { swapMaxFee: 100n })
      await expect(
        protocol.swap({ tokenIn: TRX, tokenOut: USDT, tokenInAmount: 1000000n })
      ).rejects.toThrow('exceeds swapMaxFee limit')
    })

    test('throws on V3 or mixed pool routes', async () => {
      mockFetch({ ...MOCK_ROUTE, poolVersions: ['v2', 'v3'] })
      await expect(
        protocol.swap({ tokenIn: TRX, tokenOut: USDT, tokenInAmount: 1000000n })
      ).rejects.toThrow('SunSwap V3 or mixed pools')
    })
  })
})
