// PUSD Treasury Types & Validation
import { z } from "zod";

// Amount in lamports (PUSD has 6 decimals, so 1 PUSD = 1,000,000 lamports)
export const AmountInLamportsSchema = z.number().int().nonnegative();
export type AmountInLamports = z.infer<typeof AmountInLamportsSchema>;

// Amount in PUSD (decimal)
export const AmountInPusdSchema = z.number().nonnegative();
export type AmountInPusd = z.infer<typeof AmountInPusdSchema>;

// Treasury balance snapshot
export const PusdBalanceSchema = z.object({
  lamports: AmountInLamportsSchema.describe("Raw amount in lamports"),
  pusd: AmountInPusdSchema.describe("Formatted amount in PUSD"),
  usd_value: z.number().nonnegative().describe("USD value at current rate"),
  last_updated: z.string().datetime().describe("Timestamp of last RPC query"),
});
export type PusdBalance = z.infer<typeof PusdBalanceSchema>;

// Single transaction record
export const TransactionRecordSchema = z.object({
  tx_hash: z.string().describe("Solana transaction hash"),
  timestamp: z.string().datetime().describe("Transaction timestamp"),
  amount: AmountInPusdSchema.describe("Amount transferred in PUSD"),
  sender: z.string().describe("Source wallet address"),
  recipient: z.string().describe("Destination wallet address"),
  status: z.enum(["success", "pending", "failed"]).describe("Transaction status"),
  reason: z.string().optional().describe("Transfer reason (agent policy field)"),
  approved_by: z.string().optional().describe("Multi-sig signer who approved"),
});
export type TransactionRecord = z.infer<typeof TransactionRecordSchema>;

// Spending analytics
export const SpendingCategorySchema = z.object({
  category: z.string().describe("Spending category (e.g., 'development', 'marketing')"),
  amount: AmountInPusdSchema.describe("Total spent this period"),
  transaction_count: z.number().int().nonnegative().describe("Number of transactions"),
  percentage: z.number().min(0).max(100).describe("Percentage of total spend"),
});
export type SpendingCategory = z.infer<typeof SpendingCategorySchema>;

export const TreasuryAnalyticsSchema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).describe("Analytics period"),
  start_date: z.string().date().describe("Period start date"),
  end_date: z.string().date().describe("Period end date"),
  total_received: AmountInPusdSchema.describe("Total received this period"),
  total_spent: AmountInPusdSchema.describe("Total spent this period"),
  net_change: z.number().describe("Net change (can be negative)"),
  transaction_count: z.number().int().nonnegative(),
  by_category: z.array(SpendingCategorySchema).describe("Breakdown by category"),
  approval_rate: z.number().min(0).max(100).describe("Percentage of transfers approved (vs auto-executed)"),
});
export type TreasuryAnalytics = z.infer<typeof TreasuryAnalyticsSchema>;

// Transfer request (from agent to Kimi's execution layer)
export const TransferRequestSchema = z.object({
  recipient: z.string().describe("Destination wallet address"),
  amount: AmountInPusdSchema.describe("Amount in PUSD to transfer"),
  reason: z.string().describe("Reason for transfer (logged in policy)"),
  require_approval: z.boolean().default(false).describe("Force multi-sig approval even if under limit"),
});
export type TransferRequest = z.infer<typeof TransferRequestSchema>;

// Transfer response (from Kimi's execution)
export const TransferResponseSchema = z.object({
  tx_hash: z.string().describe("Solana transaction hash"),
  status: z.enum(["pending", "confirmed"]).describe("Transaction status"),
  amount: AmountInPusdSchema.describe("Amount transferred"),
  recipient: z.string().describe("Recipient address"),
  explorer_url: z.string().url().describe("Solscan or explorer link"),
  estimated_confirmation_time: z.number().optional().describe("Seconds until confirmed"),
});
export type TransferResponse = z.infer<typeof TransferResponseSchema>;

// Policy enforcement limits
export const SpendingPolicySchema = z.object({
  daily_limit: AmountInPusdSchema.describe("Max spend per day without approval"),
  approval_threshold: AmountInPusdSchema.describe("Amount requiring multi-sig approval"),
  monthly_budget: AmountInPusdSchema.describe("Max spend per month"),
  allowed_recipients: z.array(z.string()).optional().describe("Whitelist of recipient addresses"),
});
export type SpendingPolicy = z.infer<typeof SpendingPolicySchema>;

// DAO governance metadata
export const DaoMetadataSchema = z.object({
  dao_name: z.string().describe("DAO name"),
  member_count: z.number().int().nonnegative().describe("Total members"),
  multisig_required: z.number().int().min(1).describe("Required signatures for approval"),
  treasury_owner: z.string().describe("Wallet address of treasury controller"),
  pusd_token_account: z.string().describe("SPL token account for PUSD"),
});
export type DaoMetadata = z.infer<typeof DaoMetadataSchema>;

// API Response wrappers
export const ApiErrorSchema = z.object({
  error: z.string().describe("Error message"),
  code: z.string().describe("Error code (e.g., 'INVALID_RECIPIENT', 'INSUFFICIENT_BALANCE')"),
  details: z.record(z.any()).optional().describe("Additional error context"),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    timestamp: z.string().datetime(),
  });
