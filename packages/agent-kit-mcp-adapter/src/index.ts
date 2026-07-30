/**
 * Solana Agent Kit → MCP adapter, built on the 2026-07-28 SDK.
 *
 * Replaces @solana-agent-kit/adapter-mcp, which pins @modelcontextprotocol/sdk
 * ^1.7.0 — a package line that stops at protocol 2025-11-25 and will not carry
 * the stateless core. That pin blocked our whole MCP surface from moving forward,
 * for 107 lines of schema translation we can own outright.
 *
 * Deliberately keeps the upstream signature (`createMcpServer(actions, agent,
 * options)`) so it is a drop-in swap, with two behaviour fixes noted below.
 */

import { McpServer, fromJsonSchema, type JsonSchemaType } from "@modelcontextprotocol/server";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/server/validators/ajv";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z, type ZodTypeAny } from "zod";

/**
 * Agent Kit actions define their schemas with zod 3; @modelcontextprotocol/server
 * depends on zod ^4.2.0 and wants a Standard Schema. Rather than couple this
 * adapter to either zod major — which would force a monorepo-wide zod 4 upgrade
 * we do not want yet — we translate through JSON Schema, which both sides speak.
 */
const validator = new AjvJsonSchemaValidator();

/** An Agent Kit action. Structural, so we don't take a dep on solana-agent-kit. */
export interface AgentKitAction {
  name: string;
  description?: string;
  /** Zod object schema describing the tool's arguments. */
  schema: ZodTypeAny;
  handler: (agent: unknown, params: Record<string, unknown>) => Promise<unknown>;
  /** Optional usage examples, exposed as an MCP prompt per action. */
  examples?: Array<Array<{ input: unknown; output: unknown; explanation?: string }>>;
}

export interface CreateMcpServerOptions {
  name: string;
  version: string;
  /** Registration failures throw instead of being skipped. Default false. */
  strict?: boolean;
}

function isZodObject(schema: unknown): boolean {
  return (
    schema instanceof z.ZodObject ||
    (schema as { _def?: { typeName?: string } })?._def?.typeName === "ZodObject"
  );
}

/**
 * A JSON Schema object describing a tool's arguments.
 *
 * Aliased to the SDK's own type so the two never drift — zodToJsonSchema returns
 * a looser shape and gets narrowed to this once validated.
 */
export type ToolJsonSchema = JsonSchemaType;

/**
 * Convert an Agent Kit zod 3 schema into JSON Schema for MCP.
 *
 * The upstream adapter walked the zod shape and did
 * `isZodOptional(v) ? v.unwrap() : v`, which unwraps `z.string().optional()` down
 * to `z.string()` — silently turning every optional parameter into a required
 * one. Any Agent Kit action with optional arguments has therefore been
 * advertising them to the model as mandatory. Going through JSON Schema keeps
 * `required` correct by construction, because optionality is expressed there as
 * absence from the `required` array rather than as a wrapper type.
 */
export function agentKitSchemaToJsonSchema(schema: ZodTypeAny): ToolJsonSchema {
  if (!isZodObject(schema)) {
    const typeName = (schema as { _def?: { typeName?: string } })?._def?.typeName;
    throw new Error(
      `MCP tools require an object schema at the top level, got ${typeName ?? typeof schema}`,
    );
  }

  const json = zodToJsonSchema(schema, { $refStrategy: "none", target: "jsonSchema7" }) as
    Record<string, unknown>;

  // zodToJsonSchema emits a $schema key and may hoist definitions; MCP wants a
  // bare object schema for inputSchema.
  delete json.$schema;
  delete json.definitions;

  if (json.type !== "object") {
    throw new Error(`Expected an object JSON Schema, got type "${String(json.type)}"`);
  }

  return json as unknown as ToolJsonSchema;
}

/** Normalise whatever an action handler returned into MCP text content. */
function toTextContent(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    // Circular or otherwise unserialisable — a tool result must still come back
    // as something, so degrade rather than throw inside the handler.
    return String(value);
  }
}

/**
 * Build an MCP server exposing every Agent Kit action as a tool.
 *
 * Unlike upstream, a single malformed action does not abort the whole server:
 * it is skipped with a warning so the other tools still come up. Pass
 * `strict: true` to get the old throw-on-first-failure behaviour.
 */
export function createMcpServer(
  actions: Record<string, AgentKitAction>,
  agent: unknown,
  options: CreateMcpServerOptions,
): McpServer {
  const server = new McpServer({ name: options.name, version: options.version });

  for (const action of Object.values(actions)) {
    try {
      registerAction(server, action, agent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (options.strict) {
        throw new Error(`Failed to register tool "${action.name}": ${msg}`);
      }
      console.warn(`[agent-kit-mcp] skipping tool "${action.name}": ${msg}`);
    }
  }

  return server;
}

function registerAction(server: McpServer, action: AgentKitAction, agent: unknown): void {
  const jsonSchema = agentKitSchemaToJsonSchema(action.schema);

  server.registerTool(
    action.name,
    {
      description: action.description ?? "",
      inputSchema: fromJsonSchema<Record<string, unknown>>(jsonSchema, validator),
    },
    async (params: Record<string, unknown>) => {
      try {
        const result = await action.handler(agent, params);
        return { content: [{ type: "text" as const, text: toTextContent(result) }] };
      } catch (err) {
        // Tool errors are results, not transport failures — returning isError
        // lets the model see and react to the message instead of the call
        // dying somewhere it cannot observe.
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: err instanceof Error ? err.message : "Unknown error occurred",
            },
          ],
        };
      }
    },
  );

  if (action.examples?.length) {
    registerExamplesPrompt(server, action);
  }
}

function registerExamplesPrompt(server: McpServer, action: AgentKitAction): void {
  server.registerPrompt(
    `${action.name}-examples`,
    {
      description: `Usage examples for ${action.name}`,
      argsSchema: fromJsonSchema<{ showIndex?: string }>(
        {
          type: "object",
          properties: {
            showIndex: { type: "string", description: "Zero-based example index to show" },
          },
        },
        validator,
      ),
    },
    ({ showIndex }: { showIndex?: string }) => {
      const examples = (action.examples ?? []).flat();

      let selected = examples;
      if (showIndex !== undefined) {
        const i = Number.parseInt(showIndex, 10);
        // Upstream indexed blindly, so a bad index produced `[undefined]` and
        // a prompt reading "Input: undefined". Fall back to all examples.
        selected = Number.isInteger(i) && i >= 0 && i < examples.length ? [examples[i]] : examples;
      }

      const body = selected
        .map(
          (ex, idx) =>
            `Example ${idx + 1}:\n` +
            `Input: ${toTextContent(ex.input)}\n` +
            `Output: ${toTextContent(ex.output)}` +
            (ex.explanation ? `\nExplanation: ${ex.explanation}` : ""),
        )
        .join("\n\n");

      return {
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: `Examples for ${action.name}:\n\n${body}` },
          },
        ],
      };
    },
  );
}
