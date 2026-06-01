export default class TronSwapProtocol extends SwapProtocol {
    constructor(account: IWalletAccountReadOnly, config?: TronSwapProtocolConfig);
    constructor(account: IWalletAccount, config?: TronSwapProtocolConfig);
    protected _config: TronSwapProtocolConfig;
    swap(options: SwapOptions): Promise<SwapResult>;
    quoteSwap(options: SwapOptions): Promise<Omit<SwapResult, 'hash'>>;
}
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type IWalletAccountReadOnly = import("@tetherto/wdk-wallet").IWalletAccountReadOnly;
export type SwapOptions = import("@tetherto/wdk-wallet/protocols").SwapOptions;
export type SwapResult = import("@tetherto/wdk-wallet/protocols").SwapResult;
export type TronSwapProtocolConfig = {
    /** TronGrid full node endpoint. Defaults to mainnet. */
    fullHost?: string;
    /** Optional TronGrid API key for higher rate limits. */
    tronGridApiKey?: string;
    /** Slippage tolerance in basis points (default: 50 = 0.5%). */
    slippageBps?: number;
    /** Maximum acceptable swap fee in SUN. */
    swapMaxFee?: number | bigint;
};
import { SwapProtocol } from '@tetherto/wdk-wallet/protocols';
