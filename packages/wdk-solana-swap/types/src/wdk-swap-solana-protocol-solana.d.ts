export default class SolanaSwapProtocol extends SwapProtocol {
    constructor(account: IWalletAccount, config?: SolanaSwapProtocolConfig);
    /**
     * Quotes the cost of a swap without executing it.
     *
     * @param {SwapOptions} options
     * @returns {Promise<Omit<SwapResult, 'hash'>>}
     */
    quoteSwap(options: SwapOptions): Promise<Omit<SwapResult, 'hash'>>;
    /**
     * Executes a token swap via Jupiter aggregator on Solana.
     *
     * @param {SwapOptions} options
     * @returns {Promise<SwapResult>}
     */
    swap(options: SwapOptions): Promise<SwapResult>;
}
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type IWalletAccountReadOnly = import("@tetherto/wdk-wallet").IWalletAccountReadOnly;
export type SwapOptions = import("@tetherto/wdk-wallet/protocols").SwapOptions;
export type SwapResult = import("@tetherto/wdk-wallet/protocols").SwapResult;
export type SolanaSwapProtocolConfig = {
    /** Solana RPC endpoint URL. Defaults to mainnet-beta public RPC. */
    rpcUrl?: string;
    /** Slippage tolerance in basis points (default: 50 = 0.5%). */
    slippageBps?: number;
    /** Maximum acceptable platform fee in lamports. */
    swapMaxFee?: number | bigint;
};
import { SwapProtocol } from '@tetherto/wdk-wallet/protocols';
