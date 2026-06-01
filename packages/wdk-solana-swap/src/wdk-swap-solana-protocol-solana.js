// Copyright 2026 Clawdrop <info@asicgenesis.com>
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

'use strict'

import { SwapProtocol } from '@tetherto/wdk-wallet/protocols'
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */
/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnly} IWalletAccountReadOnly */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwapOptions} SwapOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwapResult} SwapResult */

const JUPITER_QUOTE_URL = 'https://quote-api.jup.ag/v6/quote'
const JUPITER_SWAP_URL = 'https://quote-api.jup.ag/v6/swap'
const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com'
const DEFAULT_SLIPPAGE_BPS = 50 // 0.5%

/**
 * @typedef {Object} SolanaSwapProtocolConfig
 * @property {string} [rpcUrl] - Solana RPC endpoint. Defaults to mainnet-beta public RPC.
 * @property {number} [slippageBps] - Slippage tolerance in basis points (default: 50 = 0.5%).
 * @property {number | bigint} [swapMaxFee] - Maximum acceptable platform fee in lamports.
 */

export default class SolanaSwapProtocol extends SwapProtocol {
  /**
   * @param {IWalletAccount} account
   * @param {SolanaSwapProtocolConfig} [config]
   */
  constructor (account, config = {}) {
    super(account, config)
    this._rpcUrl = config.rpcUrl ?? DEFAULT_RPC
    this._slippageBps = config.slippageBps ?? DEFAULT_SLIPPAGE_BPS
    this._connection = new Connection(this._rpcUrl, 'confirmed')
  }

  /**
   * Calls Jupiter Quote API.
   *
   * @private
   * @param {SwapOptions} options
   * @returns {Promise<object>} Raw Jupiter quote response
   */
  async _jupiterQuote (options) {
    const { tokenIn, tokenOut } = options
    let amount, swapMode

    if (options.tokenInAmount != null) {
      amount = options.tokenInAmount.toString()
      swapMode = 'ExactIn'
    } else if (options.tokenOutAmount != null) {
      amount = options.tokenOutAmount.toString()
      swapMode = 'ExactOut'
    } else {
      throw new Error('Either tokenInAmount or tokenOutAmount must be provided')
    }

    const params = new URLSearchParams({
      inputMint: tokenIn,
      outputMint: tokenOut,
      amount,
      swapMode,
      slippageBps: this._slippageBps.toString()
    })

    const res = await fetch(`${JUPITER_QUOTE_URL}?${params}`)
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Jupiter quote error (${res.status}): ${body}`)
    }
    return res.json()
  }

  /**
   * Quotes the cost of a swap without executing it.
   *
   * @param {SwapOptions} options
   * @returns {Promise<Omit<SwapResult, 'hash'>>}
   */
  async quoteSwap (options) {
    const quote = await this._jupiterQuote(options)
    return {
      fee: BigInt(quote.platformFee?.amount ?? 0),
      tokenInAmount: BigInt(quote.inAmount),
      tokenOutAmount: BigInt(quote.outAmount)
    }
  }

  /**
   * Executes a token swap via Jupiter aggregator on Solana.
   *
   * @param {SwapOptions} options
   * @returns {Promise<SwapResult>}
   */
  async swap (options) {
    const address = await this._account.getAddress()
    const quote = await this._jupiterQuote(options)

    // Enforce max fee if configured
    if (this._config.swapMaxFee != null) {
      const fee = BigInt(quote.platformFee?.amount ?? 0)
      if (fee > BigInt(this._config.swapMaxFee)) {
        throw new Error(`Swap fee ${fee} exceeds swapMaxFee limit ${this._config.swapMaxFee}`)
      }
    }

    // Fetch swap transaction from Jupiter
    const swapRes = await fetch(JUPITER_SWAP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: address,
        destinationTokenAccount: options.to ?? undefined,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto'
      })
    })

    if (!swapRes.ok) {
      const body = await swapRes.text()
      throw new Error(`Jupiter swap error (${swapRes.status}): ${body}`)
    }

    const { swapTransaction } = await swapRes.json()

    // Deserialize, sign, and broadcast
    const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'))

    const { keyPair } = this._account
    if (!keyPair?.privateKey) {
      throw new Error('Account private key unavailable — dispose() may have been called')
    }

    tx.sign([Keypair.fromSecretKey(keyPair.privateKey)])

    const hash = await this._connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3
    })
    await this._connection.confirmTransaction(hash, 'confirmed')

    return {
      hash,
      fee: BigInt(quote.platformFee?.amount ?? 0),
      tokenInAmount: BigInt(quote.inAmount),
      tokenOutAmount: BigInt(quote.outAmount)
    }
  }
}
