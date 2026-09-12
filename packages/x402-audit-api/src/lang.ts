// One place to decide what a file is, so each engine only runs on files it
// understands. Without this the Solidity patterns would be regexed across
// TypeScript and vice versa, and every report would be noise.
export type Lang =
  | 'solidity'
  | 'rust'
  | 'clarity'
  | 'move'
  | 'cpp'
  | 'js'
  | 'config'
  | 'doc'
  | 'other';

export function langOf(path: string): Lang {
  if (/\.sol$/i.test(path))                      return 'solidity';
  if (/\.rs$/i.test(path))                       return 'rust';
  if (/\.clar$/i.test(path))                     return 'clarity';
  if (/\.move$/i.test(path))                     return 'move';
  // Bitcoin Core, Elements and their forks — sidechain and bridge consensus
  // code. Only the verification-cache rules run here; there is no general C++
  // rule set and claiming otherwise would overstate the coverage.
  if (/\.(cpp|cc|cxx|hpp|hh)$/i.test(path))      return 'cpp';
  if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(path))  return 'js';
  if (/\.(toml|ya?ml)$|\.json$|(^|\/)\.env/i.test(path)) return 'config';
  if (/\.md$/i.test(path))                       return 'doc';
  return 'other';
}

// Contract languages hold funds, so they get first claim on the file budget.
export const CONTRACT_LANGS: ReadonlySet<Lang> = new Set<Lang>([
  'solidity', 'rust', 'clarity', 'move', 'cpp',
]);

export function isContractLang(path: string): boolean {
  return CONTRACT_LANGS.has(langOf(path));
}

// Solidity and Rust both use /* */ and //, so one stripper serves both. Run it
// before any rule that must not fire on commented-out or documented code.
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

export interface CodeBlock {
  name:   string;
  header: string;
  body:   string;
}

// Brace-matched extraction of function bodies. Several rules only make sense
// within one function — a nonce declared in a different function does not stop
// this one from being replayable — so file-level regex is not enough.
//
// Braces inside string literals can confuse the depth count; that costs us an
// occasional truncated body, not a crash.
export function splitFunctions(src: string, keyword = 'function'): CodeBlock[] {
  const out: CodeBlock[] = [];
  const re = new RegExp(`\\b${keyword}\\s+(\\w+)\\s*(?:<[^>]*>)?\\s*\\(`, 'g');

  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const open = src.indexOf('{', m.index);
    if (open === -1) continue;

    // A declaration ending in ';' before any '{' is an interface stub — no body.
    const semi = src.indexOf(';', m.index);
    if (semi !== -1 && semi < open) continue;

    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }

    out.push({
      name:   m[1],
      header: src.slice(m.index, open),
      body:   src.slice(open, i),
    });
  }

  return out;
}
