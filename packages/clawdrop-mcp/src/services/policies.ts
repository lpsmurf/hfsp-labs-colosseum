import { z } from 'zod';
import logger from '../utils/logger';

/**
 * Policy Schema
 * Defines spending limits, token allowlists, and approval thresholds
 */
export const PolicySchema = z.object({
  id: z.string().optional(),
  owner_id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  
  // Spending limits
  max_transaction_usd: z.number().positive().default(10000),
  daily_spend_cap_usd: z.number().positive().default(50000),
  weekly_spend_cap_usd: z.number().positive().default(250000),
  
  // Token controls
  token_allowlist: z.array(z.string()).default(['SOL', 'USDC', 'USDT']),
  token_denylist: z.array(z.string()).default([]),
  
  // Protocol controls
  approved_protocols: z.array(z.string()).default(['solana', 'raydium', 'marinade']),
  
  // Approval thresholds
  require_approval_above_usd: z.number().default(5000),
  approval_timeout_minutes: z.number().default(30),
  
  // Permissions
  permissions: z.object({
    can_read: z.boolean().default(true),
    can_propose: z.boolean().default(true),
    can_execute: z.boolean().default(false),
  }).optional(),
  
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type Policy = z.infer<typeof PolicySchema>;

/**
 * Payment Check Result
 */
export const PaymentCheckResultSchema = z.object({
  approved: z.boolean(),
  reason: z.string().optional(),
  requires_approval: z.boolean(),
  daily_spent_so_far: z.number(),
  remaining_daily_budget: z.number(),
});

export type PaymentCheckResult = z.infer<typeof PaymentCheckResultSchema>;

/**
 * Check if a payment is allowed by the policy
 * Currently always returns true (stub for demo)
 * Later: enforce spending limits, token allowlists, etc.
 */
export async function checkPaymentPolicy(
  policy: Policy,
  payment: {
    amount_usd: number;
    token: string;
    destination: string;
  }
): Promise<PaymentCheckResult> {
  logger.info(
    { policy_id: policy.id, amount: payment.amount_usd, token: payment.token },
    'Checking payment policy'
  );

  // TODO: Implement actual policy checks
  // - Check daily spend cap
  // - Check weekly spend cap
  // - Check token allowlist/denylist
  // - Check approved protocols
  // - Determine if approval required

  // For now, always approve
  const result = PaymentCheckResultSchema.parse({
    approved: true,
    reason: 'Policy check stub (always approved for demo)',
    requires_approval: false,
    daily_spent_so_far: 0,
    remaining_daily_budget: policy.daily_spend_cap_usd,
  });

  logger.info({ approved: result.approved }, 'Payment policy checked');
  return result;
}

/**
 * Get default policy for new users
 */
export function getDefaultPolicy(owner_id: string): Policy {
  return PolicySchema.parse({
    owner_id,
    name: 'Default Policy',
    description: 'Default spending policy for new users',
    max_transaction_usd: 10000,
    daily_spend_cap_usd: 50000,
    weekly_spend_cap_usd: 250000,
    token_allowlist: ['SOL', 'USDC', 'USDT', 'HERD'],
    approved_protocols: ['solana', 'raydium', 'marinade', 'orca'],
    require_approval_above_usd: 5000,
    permissions: {
      can_read: true,
      can_propose: true,
      can_execute: true,
    },
  });
}

/**
 * Validate policy schema
 */
export function validatePolicy(policy: unknown): Policy {
  return PolicySchema.parse(policy);
}
