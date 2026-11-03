// Realistic mock responses for Backed xChange API.
// Active when BACKED_API_KEY is empty and NODE_ENV !== "production".
// Mirrors the exact shape the real API returns — swap for live calls once onboarded.

import crypto from "node:crypto";

export const MOCK_ASSETS = [
  {
    id: "AAPLx",
    identifier: "AAPLx",
    name: "Apple Inc. (Tokenized)",
    symbol: "AAPLx",
    network: "Solana",
    mintAddress: "3vAs4D1WE6Na4tCgt4BApgLJ5eBCNztgBvxBGRSoN1vn",
    isTradingHalted: false,
    minOrderFiatValue: 1000,   // $10 in cents
    maxOrderFiatValue: 1000000, // $10,000 in cents
    executionTimeoutSeconds: 120,
    tradingHoursMode: "NYSE",
  },
  {
    id: "TSLAx",
    identifier: "TSLAx",
    name: "Tesla Inc. (Tokenized)",
    symbol: "TSLAx",
    network: "Solana",
    mintAddress: "9pDEi3yVR4RHGsZ5ANGP8tdaGMJtfFdHBaKdtKSVFWM9",
    isTradingHalted: false,
    minOrderFiatValue: 1000,
    maxOrderFiatValue: 500000,
    executionTimeoutSeconds: 120,
    tradingHoursMode: "NYSE",
  },
  {
    id: "MSFTx",
    identifier: "MSFTx",
    name: "Microsoft Corp. (Tokenized)",
    symbol: "MSFTx",
    network: "Solana",
    mintAddress: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    isTradingHalted: false,
    minOrderFiatValue: 1000,
    maxOrderFiatValue: 750000,
    executionTimeoutSeconds: 120,
    tradingHoursMode: "NYSE",
  },
  {
    id: "GOOGLx",
    identifier: "GOOGLx",
    name: "Alphabet Inc. (Tokenized)",
    symbol: "GOOGLx",
    network: "Solana",
    mintAddress: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
    isTradingHalted: true,
    minOrderFiatValue: 1000,
    maxOrderFiatValue: 500000,
    executionTimeoutSeconds: 120,
    tradingHoursMode: "NYSE",
  },
];

// Simulated prices (USD)
const MOCK_PRICES: Record<string, number> = {
  AAPLx:  214.50,
  TSLAx:  247.80,
  MSFTx:  442.10,
  GOOGLx: 178.30,
};

export function mockSoftQuote(body: {
  identifier: string;
  side: "Buy" | "Sell";
  network: string;
  quantity?: string;
  cashAmount?: string;
}) {
  const price = MOCK_PRICES[body.identifier] ?? 100;
  const quantity = body.quantity
    ? parseFloat(body.quantity)
    : parseFloat(body.cashAmount ?? "100") / price;
  const cashAmount = body.cashAmount
    ? parseFloat(body.cashAmount)
    : quantity * price;

  const now = new Date();
  const expires = new Date(now.getTime() + 30_000);

  return {
    id:         crypto.randomUUID(),
    clientId:   "mock-client-id",
    network:    body.network,
    side:       body.side,
    identifier: body.identifier,
    quantity:   quantity.toFixed(6),
    cashAmount: cashAmount.toFixed(2),
    price,
    createdAt:  now.toISOString(),
    expiresAt:  expires.toISOString(),
    _mock:      true,
  };
}

export function mockRfq(body: {
  identifier?: string;
  side?: "Buy" | "Sell";
  network: string;
  quantity?: string;
  cashAmount?: string;
  paymentWalletIdentifier: string;
  receivingWalletIdentifier: string;
  softQuoteId?: string;
}) {
  const identifier = body.identifier ?? "AAPLx";
  const price      = MOCK_PRICES[identifier] ?? 100;
  const quantity   = body.quantity
    ? parseFloat(body.quantity)
    : parseFloat(body.cashAmount ?? "100") / price;
  const cashAmount = body.cashAmount
    ? parseFloat(body.cashAmount)
    : quantity * price;

  const id = crypto.randomUUID();

  // Placeholder base64 tx — in prod this is a real partially-signed VersionedTransaction
  const mockTxBytes = Buffer.from(`mock-versioned-tx:${id}:${identifier}:${body.side ?? "Buy"}`);

  return {
    id,
    clientId:                  "mock-client-id",
    network:                   body.network,
    side:                      body.side ?? "Buy",
    identifier,
    quantity:                  quantity.toFixed(6),
    cashAmount:                cashAmount.toFixed(2),
    price,
    paymentWalletIdentifier:   body.paymentWalletIdentifier,
    receivingWalletIdentifier: body.receivingWalletIdentifier,
    // On Solana: base64-encoded partially-signed VersionedTransaction
    signature:                 mockTxBytes.toString("base64"),
    signaturePayload:          null,
    generalStatus:             "Accepted",
    blockchainStatus:          "PendingExecution",
    hedgingStatus:             "InProgress",
    createdAt:                 new Date().toISOString(),
    expiresAt:                 new Date(Date.now() + 120_000).toISOString(),
    _mock:                     true,
  };
}

export function mockQuoteStatus(id: string) {
  return {
    id,
    generalStatus:    "Completed",
    blockchainStatus: "Executed",
    hedgingStatus:    "Succeeded",
    _mock:            true,
  };
}
