import { z } from 'zod';

/**
 * Payment Model - tracks SOL/HERD payments for tier purchases
 */

export const PaymentSchema = z.object({
  payment_id: z.string().describe('Unique payment identifier'),
  wallet_address: z.string().describe('Customer wallet address'),
  tier_id: z.string().describe('Tier being purchased'),
  amount_sol: z.number().positive().describe('Amount in SOL'),
  amount_herd: z.number().positive().optional().describe('Amount in HERD if applicable'),
  token: z.enum(['sol', 'herd']).describe('Token used'),
  tx_hash: z.string().nullable().describe('Devnet transaction hash'),
  status: z.enum(['pending', 'confirmed', 'failed']).describe('Payment status'),
  confirmed_at: z.date().nullable().describe('Timestamp when confirmed on-chain'),
  created_at: z.date(),
  expires_at: z.date().describe('Payment expires after 30 minutes'),
});

export type Payment = z.infer<typeof PaymentSchema>;
