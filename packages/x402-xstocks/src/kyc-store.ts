// In-memory KYC status store, keyed by Solana wallet address.
// Survives process lifetime only — swap for Redis/Postgres in production.

export type KycStatus = "none" | "pending" | "approved" | "rejected";

export interface KycRecord {
  wallet:      string;
  status:      KycStatus;
  applicantId: string;
  updatedAt:   string;
  rejectLabels?: string[];
}

const store = new Map<string, KycRecord>();

export function getKyc(wallet: string): KycRecord {
  return store.get(wallet) ?? { wallet, status: "none", applicantId: "", updatedAt: "" };
}

export function setKyc(record: KycRecord): void {
  store.set(record.wallet, { ...record, updatedAt: new Date().toISOString() });
}

export function isApproved(wallet: string): boolean {
  return getKyc(wallet).status === "approved";
}
