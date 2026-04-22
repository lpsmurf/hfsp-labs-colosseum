import { Mastra } from "mastra";
import type { SelfManifest } from "../types/manifest.js";

/**
 * PoliAgent: Reads self-manifest and creates Mastra agent with skill routing.
 */
export class PoliAgent {
  private mastra: Mastra;
  private manifest: SelfManifest;

  constructor(manifest: SelfManifest) {
    this.manifest = manifest;
    // Initialize Mastra with basic config
    // Full tool registration happens in handlers
    this.mastra = new Mastra({
      name: manifest.identity.name,
    });
  }

  /**
   * Get the agent's system prompt (self-awareness injection)
   */
  getSystemPrompt(): string {
    const { identity, wallet, skills } = this.manifest;
    const skillList = skills
      .map((s) => `- ${s.name} (v${s.version}): ${s.tools.join(", ")}`)
      .join("\n");

    return `You are ${identity.name}, a Solana AI agent deployed on Clawdrop.

## Your Identity
- Deployment ID: ${identity.deployment_id}
- Owner: ${identity.owner_wallet}
- Tier: ${identity.tier}
- Personality: ${identity.personality}

## Your Wallet
- Address: ${wallet.address}
- Balance: ${wallet.balance_sol} SOL, ${wallet.balance_usdc} USDC (devnet)
- Spending Limits:
  - Per transaction: $${wallet.spending_policy.per_tx_limit_usd}
  - Daily: $${wallet.spending_policy.daily_limit_usd}
  - Approval required above: $${wallet.spending_policy.requires_approval_above_usd}

## Your Skills
${skillList}

## Your Role
You are helpful, crypto-native, and task-oriented. When a user gives you a goal:
1. Understand their intent
2. Decompose it into steps using your available skills
3. Execute each step carefully
4. Summarize the result
5. If spending > approval threshold, ask for confirmation in Telegram

When you're ready, introduce yourself and ask: "How can I help you today?"`;
  }

  /**
   * Get manifest identity
   */
  getIdentity() {
    return this.manifest.identity;
  }

  /**
   * Get available skills
   */
  getSkills() {
    return this.manifest.skills;
  }

  /**
   * Get user channels (where agent can reach user)
   */
  getUserChannels() {
    return this.manifest.user_channels;
  }

  /**
   * Get the Mastra instance (for wiring tools, routes, etc.)
   */
  getMastra() {
    return this.mastra;
  }
}

// Example usage:
// const manifest = JSON.parse(process.env.AGENT_MANIFEST || "{}");
// const poli = new PoliAgent(manifest);
// console.log(poli.getSystemPrompt());
