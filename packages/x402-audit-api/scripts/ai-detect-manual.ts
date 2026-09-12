/**
 * Run the AI detection pass with a human — or a chat session — standing in for
 * the model. No API key, no inference bill.
 *
 *   # 1. generate the prompt for a local repo
 *   npx tsx scripts/ai-detect-manual.ts ./path/to/repo
 *
 *   # 2. answer it, save the JSON to the response path it prints
 *
 *   # 3. grade the answer through the real grounding path
 *   npx tsx scripts/ai-detect-manual.ts ./path/to/repo --grade
 *
 * Why bother: the detection approach is unproven. Before paying for inference
 * across 40 benchmark repos it is worth knowing whether a capable model finds
 * the logic bugs at all. This runs the identical prompt construction, parsing
 * and grounding code the live path uses, so what gets validated here is what
 * ships — only the inference call is swapped out.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { selectFiles } from '../src/github.js';
import { SYSTEM_PROMPT, buildDetectPrompt } from '../src/ai/prompt.js';
import { extractJson, groundFindings } from '../src/ai/detect.js';
import { config } from '../src/config.js';

function walk(dir: string, base = dir, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(relative(base, p));
  }
  return out;
}

function main() {
  const repo  = process.argv[2];
  const grade = process.argv.includes('--grade');
  const budget = Number(
    process.argv.find(a => a.startsWith('--budget='))?.split('=')[1] ?? 160_000,
  );

  if (!repo) {
    console.error('usage: tsx scripts/ai-detect-manual.ts <repo-path> [--grade] [--budget=N]');
    process.exit(1);
  }

  // Same file selection a paid audit performs, 120-file cap included.
  const files = selectFiles(walk(repo))
    .map(p => {
      try { return { path: p, content: readFileSync(join(repo, p), 'utf8') }; }
      catch { return null; }
    })
    .filter((f): f is { path: string; content: string } => f !== null);

  const bundle = buildDetectPrompt(files, budget);

  if (!grade) {
    writeFileSync(
      config.AI_DETECT_PROMPT_PATH,
      `===== SYSTEM =====\n${SYSTEM_PROMPT}\n\n===== USER =====\n${bundle.prompt}\n`,
      'utf8',
    );
    console.log(`repo            ${repo}`);
    console.log(`files selected  ${files.length}`);
    console.log(`files in prompt ${bundle.included.length}  (omitted ${bundle.omitted})`);
    console.log(`prompt chars    ${bundle.chars}  (~${Math.round(bundle.chars / 4)} tokens)`);
    console.log(`\nprompt   -> ${config.AI_DETECT_PROMPT_PATH}`);
    console.log(`response <- ${config.AI_DETECT_RESPONSE_PATH}   (save the JSON here, then --grade)`);
    return;
  }

  if (!existsSync(config.AI_DETECT_RESPONSE_PATH)) {
    console.error(`no response at ${config.AI_DETECT_RESPONSE_PATH}`);
    process.exit(1);
  }

  const raw    = readFileSync(config.AI_DETECT_RESPONSE_PATH, 'utf8');
  const parsed = extractJson(raw);
  const { findings, rejected } = groundFindings(parsed, bundle.included);

  console.log(`parsed    ${parsed.length}`);
  console.log(`grounded  ${findings.length}`);
  console.log(`discarded ${rejected}   (cited code that was not sent)\n`);

  for (const f of findings) {
    console.log(`[${f.severity}/${f.confidence}] ${f.location}`);
    console.log(`  ${f.title}`);
  }
}

main();
