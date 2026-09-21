export type X402ErrorCode =
  | "PAYMENT_REQUIRED"
  | "TX_NOT_FOUND"
  | "TX_FAILED_ONCHAIN"
  | "TX_AMOUNT_INSUFFICIENT"
  | "TX_WRONG_RECIPIENT"
  | "TX_ALREADY_USED"
  | "RPC_ERROR";

export interface X402ErrorBody {
  ok:      false;
  code:    X402ErrorCode;
  error:   string;
  detail?: string;
}

export class X402Error extends Error {
  constructor(
    public readonly code: X402ErrorCode,
    message: string,
    public readonly httpStatus: number = 402,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = code;
  }

  toBody(): X402ErrorBody {
    return {
      ok:    false,
      code:  this.code,
      error: this.message,
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }
}

export class TxAlreadyUsed extends X402Error {
  constructor(txSig: string) {
    super("TX_ALREADY_USED", "This transaction has already been claimed", 402, `txSig: ${txSig}`);
  }
}

export class TxNotFound extends X402Error {
  constructor(txSig: string) {
    super("TX_NOT_FOUND", "Transaction not yet confirmed — wait a few seconds and retry", 402, `txSig: ${txSig}`);
  }
}

export class TxAmountInsufficient extends X402Error {
  constructor(required: bigint, actual: bigint) {
    super("TX_AMOUNT_INSUFFICIENT", `Payment too low — required ${required} atomic USDC, got ${actual}`, 402);
  }
}

export class RpcError extends X402Error {
  constructor(detail: string) {
    super("RPC_ERROR", "Solana RPC error — try again", 503, detail);
  }
}
