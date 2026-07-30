# @hfsp/agent-kit-mcp-adapter

Exposes Solana Agent Kit actions as MCP tools, built on the **2026-07-28** SDK.

Drop-in replacement for `@solana-agent-kit/adapter-mcp`.

## Why this exists

Upstream pins `@modelcontextprotocol/sdk ^1.7.0`. That package line **stops at
protocol 2025-11-25** — version 1.30.0, published the day before the 2026-07-28 GA,
still reports `LATEST_PROTOCOL_VERSION = '2025-11-25'`. There is no 2.x of `sdk`.

The 2026-07-28 SDK ships as new packages: `@modelcontextprotocol/core`,
`/server`, `/client`, all at 2.0.0. So upstream's pin blocked our entire MCP
surface from ever reaching the stateless core — for 107 lines of schema
translation. We own those lines now.

## Two bugs fixed along the way

**Optional parameters were advertised as required.** Upstream flattened the zod
shape with `isZodOptional(v) ? v.unwrap() : v`, which unwraps
`z.string().optional()` to `z.string()`. Every Agent Kit action with optional
arguments told the model those arguments were mandatory. Reproduced and covered by
a test here.

**One bad action took down every tool.** Upstream threw on the first schema it
couldn't translate. We skip it with a warning so the rest of the server still comes
up; pass `strict: true` for the old behaviour.

Also: a bad `showIndex` on an examples prompt used to render `Input: undefined`
rather than falling back.

## The zod situation

`@modelcontextprotocol/server@2` depends on **zod ^4.2.0**. Agent Kit actions define
their schemas with **zod 3**, and so does the rest of this monorepo.

Rather than force a monorepo-wide zod 4 upgrade, this adapter translates
**zod 3 → JSON Schema → MCP** via `zod-to-json-schema` and the SDK's
`fromJsonSchema` + `AjvJsonSchemaValidator`. Both zod majors speak JSON Schema, so
the adapter is coupled to neither.

This also fixes the optionality bug by construction: JSON Schema expresses optional
as *absence from the `required` array*, so there is no wrapper type to accidentally
unwrap.

## Usage

```ts
import { createMcpServer } from "@hfsp/agent-kit-mcp-adapter";

const server = createMcpServer(actionsRecord, agent, {
  name: "clawdrop-mcp",
  version: "0.1.0",
});
```

Same signature as upstream, plus optional `strict`.

## Tests

```bash
npm test -w @hfsp/agent-kit-mcp-adapter
```
