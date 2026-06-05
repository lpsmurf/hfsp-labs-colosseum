/**
 * Bento Guard — pre-execution security firewall for Poly's on-chain actions.
 *
 * Every proposed on-chain instruction (swap, send, approve, bridge) passes through
 * Bento's protect() before execution. Bento cross-verifies LLM intent against the
 * actual transaction data using multi-model consensus + MagicBlock pre-execution simulation.
 *
 * Flow:
 *   1. Agent decides on an action → passes the instruction string here
 *   2. We sign the instruction with the agent's Ed25519 keypair (identity proof)
 *   3. Bento audits the intent, simulates the tx, checks on-chain policies
 *   4. Returns ALLOW / ESCALATED / throws HIGH_RISK_DETECTED
 *
 * Register this agent at: https://app.bentoguard.xyz
 * Agent public key: HQpzmjqd9CDp3a9hPNFtu1BKiRaNDc18KucqDRghV8pu
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
// @ts-ignore — SDK ships CJS, types resolved at runtime
import { protect, verifyRegistration } from '@bentoguard/sdk';
// SDK reads AGENT_WALLET_PRIVATE_KEY from process.env for signing — set it on startup

export interface BentoAuditResult {
  verdict:     'ALLOW' | 'BLOCK' | 'ESCALATED';
  riskScore:   number;
  reasoning:   string;
  actionId?:   string;
  reviewUrl?:  string;
  latencyMs:   number;
}

let _keypair: Keypair | null = null;
let _registered: boolean | null = null;

function getAgentKeypair(): Keypair {
  if (_keypair) return _keypair;
  // Support both our env var name and the SDK's native name
  const privKeyB58 = process.env.AGENT_WALLET_PRIVATE_KEY ?? process.env.BENTO_AGENT_PRIVATE_KEY;
  if (!privKeyB58) throw new Error('AGENT_WALLET_PRIVATE_KEY not set');
  // Mirror into SDK's expected env var so it can sign internally
  process.env.AGENT_WALLET_PRIVATE_KEY = privKeyB58;
  _keypair = Keypair.fromSecretKey(bs58.decode(privKeyB58));
  return _keypair;
}

export function getAgentAddress(): string {
  return getAgentKeypair().publicKey.toBase58();
}

export async function isRegistered(): Promise<boolean> {
  if (_registered !== null) return _registered;
  try {
    _registered = await verifyRegistration({ agentAddress: getAgentAddress() });
    return _registered!;
  } catch {
    _registered = false;
    return false;
  }
}

/**
 * Run an instruction through the Bento firewall.
 * Call this before executing any on-chain action.
 */
export async function bentoCheck(instruction: string): Promise<BentoAuditResult> {
  const keypair = getAgentKeypair();
  const agentAddress = keypair.publicKey.toBase58();
  const start = Date.now();

  try {
    // SDK handles signing internally via AGENT_WALLET_PRIVATE_KEY env var
    const audit = await (protect as Function)(instruction, { agentAddress, autoPollEscalation: false });

    const raw = String(audit.recommendation ?? 'ALLOW');
    const verdict = (raw === 'BLOCKED' ? 'BLOCK' : raw) as 'ALLOW' | 'BLOCK' | 'ESCALATED';

    return {
      verdict,
      riskScore:  audit.riskScore ?? 0,
      reasoning:  audit.reasoning ?? 'No reasoning provided',
      actionId:   audit.actionId,
      reviewUrl:  audit.reviewUrl,
      latencyMs:  Date.now() - start,
    };
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === 'HIGH_RISK_DETECTED') {
      return {
        verdict:   'BLOCK',
        riskScore: 100,
        reasoning: e.message ?? 'High-risk action blocked by Bento firewall',
        latencyMs: Date.now() - start,
      };
    }
    // Fail-open: if Bento is unreachable, log and allow (configurable)
    console.warn('[bento] firewall unreachable, failing open:', e?.message);
    return {
      verdict:   'ALLOW',
      riskScore: -1,
      reasoning: `Bento unavailable: ${e?.message ?? 'unknown error'}`,
      latencyMs: Date.now() - start,
    };
  }
}
