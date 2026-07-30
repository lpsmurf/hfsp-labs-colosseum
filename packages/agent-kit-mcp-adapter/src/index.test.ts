import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import { agentKitSchemaToJsonSchema, createMcpServer, type AgentKitAction } from "./index.js";

function action(over: Partial<AgentKitAction> = {}): AgentKitAction {
  return {
    name: "test_tool",
    description: "A test tool",
    schema: z.object({ required: z.string(), maybe: z.string().optional() }),
    handler: async () => ({ ok: true }),
    ...over,
  };
}

// The bug this adapter exists to fix, besides the SDK pin: upstream unwrapped
// ZodOptional, so every optional argument was advertised to the model as required.
test("optional arguments are NOT listed as required", () => {
  const json = agentKitSchemaToJsonSchema(action().schema) as {
    required?: string[]; properties?: Record<string, unknown>;
  };
  assert.deepEqual(json.required, ["required"], "only the required field may be in `required`");
  assert.ok(json.properties?.maybe, "the optional field must still be advertised as a property");
});

test("a schema with no required fields omits or empties `required`", () => {
  const json = agentKitSchemaToJsonSchema(z.object({ a: z.string().optional() })) as {
    required?: string[];
  };
  assert.ok(!json.required?.length, `expected no required fields, got ${JSON.stringify(json.required)}`);
});

test("$schema and definitions are stripped", () => {
  const json = agentKitSchemaToJsonSchema(action().schema) as Record<string, unknown>;
  assert.ok(!("$schema" in json), "$schema must not leak into inputSchema");
  assert.ok(!("definitions" in json), "definitions must not leak into inputSchema");
  assert.equal(json.type, "object");
});

test("nested objects and enums survive translation", () => {
  const json = agentKitSchemaToJsonSchema(
    z.object({
      nested: z.object({ deep: z.number() }),
      choice: z.enum(["a", "b"]),
    }),
  ) as { properties?: Record<string, { type?: string; enum?: string[] }> };
  assert.equal(json.properties?.nested?.type, "object");
  assert.deepEqual(json.properties?.choice?.enum, ["a", "b"]);
});

test("non-object schemas are rejected with a useful message", () => {
  assert.throws(
    () => agentKitSchemaToJsonSchema(z.string()),
    /object schema at the top level/,
  );
});

test("builds a server and registers every valid action", () => {
  const server = createMcpServer(
    { a: action({ name: "tool_a" }), b: action({ name: "tool_b" }) },
    {},
    { name: "test", version: "0.0.1" },
  );
  assert.ok(server, "server should be constructed");
});

// Upstream threw on the first bad action, taking every other tool down with it.
test("one malformed action does not stop the others", () => {
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (msg: string) => { warnings.push(String(msg)); };
  try {
    const server = createMcpServer(
      {
        good: action({ name: "good_tool" }),
        bad:  action({ name: "bad_tool", schema: z.string() }),
      },
      {},
      { name: "test", version: "0.0.1" },
    );
    assert.ok(server);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /bad_tool/);
  } finally {
    console.warn = origWarn;
  }
});

test("strict mode surfaces a malformed action instead of skipping it", () => {
  assert.throws(
    () => createMcpServer(
      { bad: action({ name: "bad_tool", schema: z.string() }) },
      {},
      { name: "test", version: "0.0.1", strict: true },
    ),
    /Failed to register tool "bad_tool"/,
  );
});

test("actions with examples register without error", () => {
  const server = createMcpServer(
    {
      a: action({
        examples: [[{ input: { required: "x" }, output: { ok: true }, explanation: "basic" }]],
      }),
    },
    {},
    { name: "test", version: "0.0.1" },
  );
  assert.ok(server);
});

test("duplicate tool names are reported, not silently swallowed", () => {
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (msg: string) => { warnings.push(String(msg)); };
  try {
    createMcpServer(
      { one: action({ name: "same" }), two: action({ name: "same" }) },
      {},
      { name: "test", version: "0.0.1" },
    );
    // The SDK rejects the second registration; we must not pretend it worked.
    assert.equal(warnings.length, 1, "expected a warning for the duplicate name");
    assert.match(warnings[0], /same/);
  } finally {
    console.warn = origWarn;
  }
});
