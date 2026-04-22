import { z } from "zod";

/**
 * Self-Manifest: What the agent knows about itself at boot time.
 * Injected by create_openclaw_agent tool into container at deployment.
 */
export const SkillSchema = z.object({
  name: z.string().describe("Skill name (e.g., 'travel_booking')"),
  version: z.string().describe("Semantic version"),
  tools: z.array(z.string()).describe("List of tool names this skill provides"),
});

export const SpendingPolicySchema = z.object({
  per_tx_limit_usd: z.number().describe("Max USD per transaction"),
  daily_limit_usd: z.number().describe("Max USD per day"),
  requires_approval_above_usd: z.number().describe("Require human approval above this USD amount"),
});

export const WalletConfigSchema = z.object({
  address: z.string().describe("Agent wallet public key"),
  balance_sol: z.number().describe("SOL balance (devnet)"),
  balance_usdc: z.number().describe("USDC balance (devnet)"),
  spending_policy: SpendingPolicySchema,
});

export const IdentitySchema = z.object({
  name: z.string().describe("Agent name (e.g., 'Poli')"),
  deployment_id: z.string().describe("Unique deployment ID (ocl_...)"),
  owner_wallet: z.string().describe("Owner's wallet address"),
  tier: z.enum(["Shared", "Dedicated", "Custom"]).describe("Agent tier"),
  personality: z.string().describe("Brief personality description"),
});

export const SelfManifestSchema = z.object({
  identity: IdentitySchema,
  wallet: WalletConfigSchema,
  skills: z.array(SkillSchema),
  user_channels: z.array(z.string()).describe("Telegram, web, voice URLs"),
});

export type SelfManifest = z.infer<typeof SelfManifestSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type WalletConfig = z.infer<typeof WalletConfigSchema>;
export type Identity = z.infer<typeof IdentitySchema>;
