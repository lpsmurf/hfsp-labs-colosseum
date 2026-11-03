export class AppError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AppError";
  }
  toResponse() {
    return { ok: false, error: this.message, code: this.code };
  }
}

export class TxAlreadyUsed extends AppError {
  constructor(txSig: string) {
    super(`Transaction ${txSig.slice(0, 16)}… already used`, 402, "TX_ALREADY_USED");
  }
}

export class PaymentFailed extends AppError {
  constructor(reason: string) {
    super(`Payment verification failed: ${reason}`, 402, "PAYMENT_FAILED");
  }
}

export class BunnyUploadError extends AppError {
  constructor(reason: string) {
    super(`Bunny.net upload failed: ${reason}`, 502, "BUNNY_ERROR");
  }
}
