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
import TronWeb from 'tronweb'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */
/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnly} IWalletAccountReadOnly */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwapOptions} SwapOptions */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SwapResult} SwapResult */

const SUNSWAP_ROUTER_URL = 'https://rot.endjgfsv.link/swap/router'
// SunSwap V2 aggregation router on Tron mainnet
const SUNSWAP_V2_ROUTER = 'TXF1xDbVGdxFGbovmmmXvBGu8ZiE3Lq4mR'
const DEFAULT_FULL_HOST = 'https://api.trongrid.io'
const DEFAULT_SLIPPAGE_BPS = 50 // 0.5%
const SWAP_DEADLINE_OFFSET = 1200 // 20 minutes

/**
 * @typedef {Object} TronSwapProtocolConfig
 * @property {string} [fullHost] - TronGrid (or compatible) full node endpoint. Defaults to mainnet.
 * @property {string} [tronGridApiKey] - Optional TronGrid API key for higher rate limits.
 * @property {number} [slippageBps] - Slippage tolerance in basis points (default: 50 = 0.5%).
 * @property {number | bigint} [swapMaxFee] - Maximum acceptable swap fee in SUN.
 */

// Safely parse an amount value (integer string or decimal string) to bigint
function parseBigInt (val) {
  const str = String(val)
  if (str.includes('.')) return BigInt(Math.round(parseFloat(str)))
  return BigInt(str)
}

export default class TronSwapProtocol extends SwapProtocol {
  /**
   * @param {IWalletAccount} account
   * @param {TronSwapProtocolConfig} [config]
   */
  constructor (account, config = {}) {
    super(account, config)
    this._fullHost = config.fullHost ?? DEFAULT_FULL_HOST
    this._tronGridApiKey = config.tronGridApiKey ?? null
    this._slippageBps = config.slippageBps ?? DEFAULT_SLIPPAGE_BPS
  }

  _createTronWeb (privateKeyHex) {
    const opts = { fullHost: this._fullHost }
    if (this._tronGridApiKey) opts.headers = { 'TRON-PRO-API-KEY': this._tronGridApiKey }
    if (privateKeyHex) opts.privateKey = privateKeyHex
    return new TronWeb(opts)
  }

  /**
   * Fetches a swap route from SunSwap router API.
   *
   * @private
   * @param {SwapOptions} options
   * @returns {Promise<object>} Raw SunSwap route response
   */
  async _sunswapRoute (options) {
    const { tokenIn, tokenOut } = options

    if (options.tokenInAmount == null) {
      throw new Error('tokenInAmount is required — SunSwap router only supports ExactIn swaps')
    }

    const params = new URLSearchParams({
      fromToken: tokenIn,
      toToken: tokenOut,
      amountIn: options.tokenInAmount.toString()
    })

    const res = await fetch(`${SUNSWAP_ROUTER_URL}?${params}`)
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`SunSwap router error (${res.status}): ${body}`)
    }

    const data = await res.json()

    if (data.poolVersions && data.poolVersions.some(v => v !== 'v2')) {
      throw new Error(
        'Route uses SunSwap V3 or mixed pools — only V2 routes are supported in this version'
      )
    }

    return data
  }

  /**
   * Quotes the cost of a swap without executing it.
   *
   * @param {SwapOptions} options
   * @returns {Promise<Omit<SwapResult, 'hash'>>}
   */
  async quoteSwap (options) {
    const route = await this._sunswapRoute(options)
    return {
      fee: parseBigInt(route.fee ?? 0),
      tokenInAmount: parseBigInt(route.amountIn),
      tokenOutAmount: parseBigInt(route.amountOut)
    }
  }

  /**
   * Executes a token swap via SunSwap V2 on Tron.
   *
   * @param {SwapOptions} options
   * @returns {Promise<SwapResult>}
   */
  async swap (options) {
    const { keyPair } = this._account
    if (!keyPair?.privateKey) {
      throw new Error('Account private key unavailable — dispose() may have been called')
    }

    const privateKeyHex = Buffer.from(keyPair.privateKey).toString('hex')
    const tronWeb = this._createTronWeb(privateKeyHex)
    const address = await this._account.getAddress()

    const route = await this._sunswapRoute(options)

    if (this._config.swapMaxFee != null) {
      const fee = parseBigInt(route.fee ?? 0)
      if (fee > BigInt(this._config.swapMaxFee)) {
        throw new Error(`Swap fee ${fee} exceeds swapMaxFee limit ${this._config.swapMaxFee}`)
      }
    }

    const amountIn = parseBigInt(route.amountIn)
    const amountOut = parseBigInt(route.amountOut)
    // Apply slippage to minimum accepted output
    const amountOutMin = amountOut - (amountOut * BigInt(this._slippageBps) / 10000n)
    const path = route.tokens ?? [options.tokenIn, options.tokenOut]
    const deadline = Math.floor(Date.now() / 1000) + SWAP_DEADLINE_OFFSET
    const recipient = options.to ?? address

    const { transaction } = await tronWeb.transactionBuilder.triggerSmartContract(
      SUNSWAP_V2_ROUTER,
      'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
      { feeLimit: 150000000 },
      [
        { type: 'uint256', value: amountIn.toString() },
        { type: 'uint256', value: amountOutMin.toString() },
        { type: 'address[]', value: path },
        { type: 'address', value: recipient },
        { type: 'uint256', value: deadline }
      ],
      tronWeb.address.toHex(address)
    )

    const signedTx = await tronWeb.trx.sign(transaction, privateKeyHex)
    const result = await tronWeb.trx.sendRawTransaction(signedTx)

    if (!result.result) {
      throw new Error(`Tron broadcast failed: ${JSON.stringify(result)}`)
    }

    return {
      hash: result.txid,
      fee: parseBigInt(route.fee ?? 0),
      tokenInAmount: amountIn,
      tokenOutAmount: amountOut
    }
  }
}
