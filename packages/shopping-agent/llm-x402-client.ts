/**
 * llm-x402-client.ts — self-funding LLM inference.
 *
 * The agent pays for its OWN model calls over x402 in Solana USDC, from its OWN
 * wallet, with no API key. We build ON BlockRun's SolanaLLMClient (decision
 * locked) — it speaks an OpenAI-compatible surface and handles the
 * 402 → sign-USDC → retry handshake internally, settling on Solana so inference
 * shares the same rail as purchases and gift cards (no chain split for the LLM).
 *
 * Docs (verified 2026-06-27):
 *   - https://blockrun.ai                         (pay-per-call, 60+ models, +5% margin)
 *   - https://github.com/BlockRunAI/blockrun-llm-ts
 *   - npm: `@blockrun/llm`  →  import { SolanaLLMClient } from '@blockrun/llm'
 *   - wallet: SOLANA_WALLET_KEY env (bs58 secret) or new SolanaLLMClient({ privateKey })
 *
 * Why x402 under the hood is the same shape we already ship: BlockRun's Solana
 * client performs exactly the 402 → pay(USDC) → retry loop that @hfsp/x402-sdk's
 * X402Client implements (see packages/x402-sdk/src/client/index.ts). We let the
 * BlockRun SDK own the LLM payment so we don't reinvent it; we keep @hfsp's
 * client for paying OUR OWN x402-gated services (x402-store gift cards, etc.).
 *
 * This stub declares the SDK's shape locally and loads it via dynamic import,
 * so the file typechecks and the demo runs even before `@blockrun/llm` is
 * installed. Install the package to enable live calls.
 */

import type { ChatMessage, LlmGateway } from "./providers.js";

/** Local view of the parts of @blockrun/llm we use — keeps typecheck dep-free. */
interface SolanaLLMClientLike {
  chatCompletion(
    model: string,
    messages: ChatMessage[],
  ): Promise<{ choices: Array<{ message: { content: string } }> }>;
  chat(model: string, prompt: string): Promise<string>;
}
interface BlockRunModule {
  SolanaLLMClient: new (opts?: { privateKey?: string }) => SolanaLLMClientLike;
}

export interface BlockRunConfig {
  /** bs58-encoded Solana secret key. Falls back to SOLANA_WALLET_KEY env. */
  privateKey?: string;
  /** Default model id, e.g. "anthropic/claude-haiku-4.5" (cheap classifier tier). */
  defaultModel?: string;
}

/** Cheap → capable tiers. The Smart Router can also auto-pick; we pin per task. */
export const MODELS = {
  classify: "anthropic/claude-haiku-4.5", // route/triage inbound, cheapest viable
  decide: "anthropic/claude-sonnet-4.6", // ranking / buy decision
  hard: "anthropic/claude-opus-4.8", // rare, high-stakes reasoning
} as const;

export class BlockRunLlmGateway implements LlmGateway {
  private client: SolanaLLMClientLike | null = null;
  constructor(private readonly config: BlockRunConfig = {}) {}

  /** Lazily load + construct the real SDK. Throws a clear error if uninstalled. */
  private async ready(): Promise<SolanaLLMClientLike> {
    if (this.client) return this.client;
    let mod: BlockRunModule;
    try {
      // Widened to `string` on purpose: @blockrun/llm is an optional runtime dep
      // (install to go live). A non-literal specifier keeps tsc from requiring
      // it at compile time, so this stub typechecks before the package exists.
      const pkg: string = "@blockrun/llm";
      mod = (await import(pkg)) as unknown as BlockRunModule;
    } catch {
      throw new Error(
        "@blockrun/llm is not installed. Run `npm i @blockrun/llm` to enable live inference.",
      );
    }
    const privateKey = this.config.privateKey ?? process.env.SOLANA_WALLET_KEY;
    this.client = new mod.SolanaLLMClient(privateKey ? { privateKey } : undefined);
    return this.client;
  }

  /** Pay-per-request chat completion. The SDK signs the USDC payment for us. */
  async chat(model: string, messages: ChatMessage[]): Promise<string> {
    const client = await this.ready();
    const res = await client.chatCompletion(model, messages);
    return res.choices[0]?.message.content ?? "";
  }

  /** Convenience: single-turn prompt with the configured default model. */
  async ask(prompt: string, model = this.config.defaultModel ?? MODELS.classify): Promise<string> {
    return this.chat(model, [{ role: "user", content: prompt }]);
  }
}
