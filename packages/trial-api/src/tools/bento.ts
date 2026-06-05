import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { bentoCheck, isRegistered, getAgentAddress } from '../bento-guard.js';

const BentoInput = z.object({
  instruction: z.string().describe(
    'The on-chain action you are about to execute, described in plain English. ' +
    'E.g. "Swap 10 USDC for SOL on Jupiter" or "Send 0.5 SOL to address ABC..."'
  ),
});

const BentoOutput = z.object({
  verdict:    z.enum(['ALLOW', 'BLOCK', 'ESCALATED']),
  riskScore:  z.number(),
  reasoning:  z.string(),
  actionId:   z.string().optional(),
  reviewUrl:  z.string().optional(),
  latencyMs:  z.number(),
  agentId:    z.string(),
});

export const bentoGuardCheck = createTool({
  id: 'bento_guard_check',
  description:
    'Run a proposed on-chain action through the Bento security firewall BEFORE executing it. ' +
    'Bento audits the instruction against the actual transaction, simulates execution, ' +
    'and checks on-chain policies. Always call this before any swap, send, approve, or DeFi action. ' +
    'Returns ALLOW (safe), BLOCK (malicious — do not proceed), or ESCALATED (needs human review).',
  inputSchema:  BentoInput,
  outputSchema: BentoOutput,
  execute: async ({ context }) => {
    const { instruction } = BentoInput.parse(context);

    // Verify registration on first call
    const registered = await isRegistered();
    if (!registered) {
      return {
        verdict:   'BLOCK' as const,
        riskScore: 0,
        reasoning: 'Agent not registered with Bento Guard. Visit https://app.bentoguard.xyz to register.',
        latencyMs: 0,
        agentId:   getAgentAddress(),
      };
    }

    const result = await bentoCheck(instruction);
    return { ...result, agentId: getAgentAddress() };
  },
});
