// Minimal zero-dependency .env loader. Import this first in any entrypoint that
// reads process.env, so the documented `npx tsx scripts/<x>.ts` commands work
// without dotenv. Real env vars already in the environment take precedence.
import { readFileSync } from "fs";

try {
  const txt = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* no .env present — rely on the ambient environment */
}
