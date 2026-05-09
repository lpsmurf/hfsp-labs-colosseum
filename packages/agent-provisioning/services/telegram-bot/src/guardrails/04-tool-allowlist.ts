/**
 * Hook 4 — Tool Allowlist
 *
 * Intercepts: BEFORE any MCP tool call executes.
 * Poly is a curated product — it must ONLY call the tools in POLY_TOOLS.
 * This prevents the LLM from creatively calling destructive or out-of-scope
 * MCP tools even if they exist on the server (99 tools are registered).
 *
 * This hook runs on ctx.toolCall — skip it when toolCall is absent.
 */

import { GuardrailContext, GuardrailResult } from './types.js';

/**
 * The only tools Poly is allowed to call.
 * To add a new capability, add it here AND verify it works on devnet first.
 */
export const POLY_TOOLS = new Set([
  'get_token_price',
  'get_wallet_balance',
  'get_wallet_portfolio',
  'get_wallet_pnl',
  'get_token_analytics',
  'get_token_metadata',
  'check_token_risk',
  'get_trending_crypto',
  'get_crypto_markets',
  'get_crypto_price',
  'get_market_overview',
  'search_crypto',
  // Transactional (devnet only — enforced in swap-guard)
  'swap_tokens',
  'get_wallet_transactions',
]);

/**
 * Tools that exist on the MCP server but are NEVER available to Poly.
 * Listed explicitly so any future code that queries this can audit them.
 */
export const BLOCKED_TOOLS = [
  'delete_agent',
  'recreate_vm',
  'set_root_password',
  'dns_update',
  'purchase_domain',
  'billing_delete_payment_method',
  // travel / hotel tools — wrong product
  'search_flights',
  'search_hotels',
  'search_cheapest_dates',
  // IPFS — not exposed to end users
  'pin_to_ipfs',
  'get_from_ipfs',
];

export async function toolAllowlistHook(ctx: GuardrailContext): Promise<GuardrailResult> {
  // This hook only runs when a tool call is present
  if (!ctx.toolCall) {
    return {
      decision: 'allow',
      audit: { hook: 'tool-allowlist', decision: 'allow', reason: 'no_tool_call' },
    };
  }

  const { name, args } = ctx.toolCall;

  if (!POLY_TOOLS.has(name)) {
    return {
      decision: 'block',
      userMessage: `I'm not able to do that through this interface. Try asking about token prices, wallet balances, or swaps instead.`,
      audit: {
        hook: 'tool-allowlist',
        decision: 'block',
        reason: 'tool_not_in_allowlist',
        meta: { toolName: name, args },
      },
    };
  }

  return {
    decision: 'allow',
    audit: {
      hook: 'tool-allowlist',
      decision: 'allow',
      reason: 'tool_allowed',
      meta: { toolName: name },
    },
  };
}
