// Request schemas for the Celo rail, shared by the x402 and checkout routes.
import { z } from "zod";

export const OrderBodySchema = z.object({
  email: z.string().email(),
  items: z.array(z.object({
    product_id: z.string().min(1),
    product_value: z.number().positive().optional(),
    beneficiary_account: z.string().optional()
      // Validate phone numbers before quoting (E.164): the supplier rejects
      // anything else, but only after a price has been locked.
      .refine(v => v === undefined || !/^[\d\s()-]+$/.test(v), "Phone numbers need international format: + and country code, e.g. +2348031234567")
      .refine(v => v === undefined || !v.startsWith("+") || /^\+[1-9]\d{6,14}$/.test(v), "Phone number must be + followed by 7–15 digits, e.g. +2348031234567"),
  })).length(1), // one item per order keeps pricing, bridging and refunds unambiguous
});

// USAT is swapped to USDT on Celo before bridging (no direct USAT → Base route).
export const AssetSchema = z.enum(["USDT", "USDC", "USAT"]);
