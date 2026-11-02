import type { RepoFile } from '../github.js';
import { langOf, isContractLang } from '../lang.js';

// The detection prompt.
//
// Shaped after evmbench's backend/worker_runner/detect.md, which is the
// production prompt behind the Paradigm/OpenAI contract-audit benchmark. Four of
// its choices are doing the real work and are worth stating plainly:
//
//   1. Loss-of-funds only. Without this an LLM returns twenty style opinions
//      per file and the signal drowns.
//   2. Privileged roles are trusted. "The owner could rug everyone" is true of
//      almost every contract and is not a finding.
//   3. Cite file plus line range. Unverifiable prose cannot be checked, and
//      anything we cannot ground we drop — see groundFindings().
//   4. Strict JSON. A finding we cannot parse is a finding we cannot report.
//
// The reason this exists at all: 81% of the gold vulnerabilities in the
// frontier-evals corpus are logic and accounting bugs — the code does exactly
// what it says and what it says is wrong. No pattern rule reaches those, which
// caps the static engines at roughly 18% on real audit work. Reading the source
// and reasoning about intent is the only route to the other 81%.

export const SYSTEM_PROMPT = `You are an expert smart contract security auditor reviewing code for loss-of-funds vulnerabilities.

Report ONLY vulnerabilities that could directly or indirectly cause loss of user or protocol assets. In scope:
- Accounting and arithmetic errors that let a caller withdraw, mint or claim more than they are owed
- Missing or incorrect access control on state that controls funds
- Incorrect share, index, rate or fee calculations
- State updated in the wrong order, or not at all, so an invariant breaks
- Reentrancy, signature replay, price manipulation
- Logic that permits a sequence of individually-valid calls to drain value

Out of scope — do NOT report these:
- Gas optimisation, naming, formatting, documentation, missing events
- Anything requiring the owner, admin or governance to act maliciously. Assume privileged roles are trusted and honest.
- Centralisation risk, upgradeability risk, or oracle-provider trust as a general concern
- Missing zero-address checks, floating pragmas, or other lint-grade issues
- Theoretical issues with no path to fund loss

Rules:
- Every finding MUST cite the file and the line range where the flaw is. Use the line numbers shown in the source listing.
- Severity is "critical" only when funds can be taken with no preconditions; otherwise "high".
- If you find nothing that meets the bar, return an empty array. An empty result is a valid and useful answer — do not invent findings to appear thorough.
- Describe the concrete exploit path. "Could be unsafe" is not a finding; "caller does X, contract credits Y, attacker repeats and withdraws Z" is.

Respond with strictly this JSON and nothing else — no prose, no markdown fences:
{"findings":[{"file":"path/as/shown.sol","line_start":42,"line_end":57,"severity":"high","title":"one sentence, sentence case","exploit":"the concrete sequence an attacker follows","impact":"what is lost and by whom","fix":"the specific change that closes it"}]}`;

export interface PromptBundle {
  prompt:       string;
  /** Files actually included, in listing order. */
  included:     RepoFile[];
  omitted:      number;
  chars:        number;
}

// Contract sources first, then anything else. A logic bug lives in the contract,
// not in the Dockerfile, and the character budget is the binding constraint.
function priority(f: RepoFile): number {
  if (isContractLang(f.path)) return 0;
  return langOf(f.path) === 'js' ? 1 : 2;
}

/**
 * Build the user message: a line-numbered listing of as much source as fits.
 *
 * Line numbers are prefixed deliberately. They are what makes a finding
 * checkable — the model cites a range, and groundFindings() verifies the range
 * exists before we report it.
 */
export function buildDetectPrompt(files: RepoFile[], charBudget: number): PromptBundle {
  const ordered = [...files]
    .filter(f => isContractLang(f.path) || langOf(f.path) === 'js')
    .sort((a, b) => priority(a) - priority(b));

  const parts: string[] = [];
  const included: RepoFile[] = [];
  let chars = 0;

  for (const f of ordered) {
    const numbered = f.content
      .split('\n')
      .map((line, i) => `${String(i + 1).padStart(4)}| ${line}`)
      .join('\n');
    const block = `\n--- FILE: ${f.path} ---\n${numbered}\n`;

    // Never include a partial file. A truncated contract invites findings about
    // code that simply was not shown.
    if (chars + block.length > charBudget) continue;

    parts.push(block);
    included.push(f);
    chars += block.length;
  }

  const omitted = ordered.length - included.length;

  const header =
    `Audit the following ${included.length} file(s) for loss-of-funds vulnerabilities.\n` +
    (omitted > 0
      ? `\nNOTE: ${omitted} further file(s) exceeded the context budget and are NOT shown. ` +
        `Do not report findings about code you cannot see, and do not assume a missing ` +
        `file is absent from the project.\n`
      : '');

  return {
    prompt:   header + parts.join(''),
    included,
    omitted,
    chars,
  };
}
