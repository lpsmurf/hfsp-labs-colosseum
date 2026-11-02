import type { RepoFile } from '../github.js';
import type { Finding } from '../report.js';
import { langOf, splitContracts, splitFunctions, stripComments } from '../lang.js';
import { guardOf } from './access-control.js';

// Denial of service and griefing.
//
// The third-largest class a pattern rule can reach in the derive half (6% of
// paid findings, behind accounting at 21% which no regex will ever see). Two
// rules, both grounded in a specific corpus finding rather than invented:
//
//   SOL-DOS-002 — noya, "executeWithdraw may be blocked if any of the users
//   are blacklisted from the baseToken". A withdraw queue is drained in a
//   `while` loop that calls `baseToken.safeTransfer(data.receiver, amount)`
//   per iteration. USDC maintains a blacklist; one blacklisted receiver at the
//   head of the queue reverts the whole transaction, and every user behind
//   them is stuck permanently.
//
//   SOL-DOS-003 — reNFT, "All orders can be hijacked to lock rental assets
//   forever by tipping a malicious ERC20". An array anyone can grow, iterated
//   somewhere that has to succeed, is a gas-limit lock waiting to be set.
//
// Neither of these is a claim that the loop is wrong. Batch payout is a normal
// design, and plenty of protocols accept the risk knowingly. They are the two
// questions an auditor asks about every loop that moves value, asked
// automatically.

/**
 * A value transfer to an address computed per iteration.
 *
 * The `call{value:}` alternative requires *empty* calldata, and that is the
 * load-bearing detail. `target.call{value: v}("")` is how you send ETH;
 * `target.call{value: v}(calldatas[i])` is how you invoke a function, and a
 * loop of those is an executor rather than a payout. OpenZeppelin's
 * `Governor._executeOperations` runs a proposal's calls that way and is
 * deliberately all-or-nothing — a proposal that half-executed would be worse
 * than one that reverted. Without the distinction it was reported twice, and
 * those were the engine's only findings on 312 files of audited code.
 */
const TRANSFER_IN_LOOP = new RegExp([
  /\.\s*(safeTransferFrom|transferFrom|safeTransfer|transfer|sendValue|send)\s*\(/.source,
  /\.\s*(call)\s*\{[^}]*value\s*:[^}]*\}\s*\(\s*(?:""|''|new\s+bytes\s*\(\s*0\s*\)|bytes\s*\(\s*""\s*\))?\s*\)/.source,
].join('|'), 'g');

// Which argument names the recipient. `transferFrom(from, to, amount)` puts it
// second; everything else puts it first.
const RECIPIENT_ARG: Record<string, number> = {
  transferFrom: 1, safeTransferFrom: 1,
  transfer: 0, safeTransfer: 0, send: 0, sendValue: 0, call: -1,
};

/** Top-level arguments of the call whose open paren is at `open`. */
function argsAt(src: string, open: number): string[] {
  const out: string[] = [];
  let depth = 0, start = open + 1;

  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) { out.push(src.slice(start, i)); return out; }
    } else if (ch === ',' && depth === 1) {
      out.push(src.slice(start, i));
      start = i + 1;
    }
  }
  return out;
}

/**
 * Does the recipient actually change from one iteration to the next?
 *
 * This is what separates a payout queue from a batch move. benddao's
 * `VaultLogic.erc721TransferOutLiquidity` loops
 * `safeTransferFrom(address(this), to, tokenIds[i])` — one fixed `to`, only the
 * token id varying. Nobody is behind anybody in that queue, so a failure
 * inconveniences exactly the caller who asked for it. Four of those were the
 * engine's holdout-half findings, and all four were false.
 *
 * A recipient varies if it is indexed, or if its root was declared inside the
 * loop body — which is how both real cases are written:
 *
 *     address recipient = holders[i];                  // althea
 *     WithdrawRequest memory data = queue[firstTemp];  // noya
 */
function recipientVaries(recipient: string, loopBody: string): boolean {
  const expr = recipient.trim();
  if (!expr) return false;
  if (/\[/.test(expr)) return true;

  const root = expr.replace(/\s*\.\s*[\s\S]*$/, '').trim();
  if (!/^[A-Za-z_]\w*$/.test(root)) return false;

  // Declared in the loop body: `<type> [memory|storage|calldata] root =`.
  return new RegExp(
    `\\b[A-Za-z_]\\w*(?:\\s*\\[\\s*\\])?\\s+(?:memory|storage|calldata\\s+)?\\s*${root}\\b\\s*=`,
  ).test(loopBody);
}

/** Is there a transfer to a per-iteration recipient anywhere in this loop? */
function hasVaryingRecipientTransfer(loopBody: string): boolean {
  TRANSFER_IN_LOOP.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = TRANSFER_IN_LOOP.exec(loopBody)) !== null) {
    const method = m[1] ?? m[2];
    const idx    = RECIPIENT_ARG[method] ?? 0;

    // A bare `call{value:}("")` names its recipient before the dot, not in an
    // argument, so fall back to the expression the call is made on.
    if (idx < 0) {
      const before = loopBody.slice(0, m.index);
      const target = /([\w.[\]()]+)\s*$/.exec(before)?.[1] ?? '';
      if (recipientVaries(target, loopBody)) return true;
      continue;
    }

    const open = loopBody.indexOf('(', m.index + m[0].length - 1);
    const args = argsAt(loopBody, open === -1 ? m.index : open);
    if (recipientVaries(args[idx] ?? '', loopBody)) return true;
  }

  return false;
}

/**
 * Loop bodies, brace-matched, with the head that opens them.
 *
 * `for` and `while` both, because the corpus case is a `while` — a queue drain
 * is the shape most likely to carry this bug and the shape a `for`-only regex
 * would miss.
 */
function loops(src: string): Array<{ head: string; body: string }> {
  const out: Array<{ head: string; body: string }> = [];
  const re = /\b(for|while)\s*\(/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    // Balanced loop head, so a `for (uint i; i < a.length; ++i)` with nested
    // parens is not cut short.
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') { depth--; if (depth === 0) { i++; break; } }
    }
    const head = src.slice(m.index, i);

    const open = src.indexOf('{', i);
    // A single-statement loop with no braces cannot contain enough to matter.
    if (open === -1 || /[;}]/.test(src.slice(i, open))) continue;

    depth = 0;
    let j = open;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) { j++; break; } }
    }

    out.push({ head, body: src.slice(open, j) });
    re.lastIndex = j;
  }

  return out;
}

const PUSHES = /\b(\w+)(?:\s*\[[^\]]*\])*\s*\.\s*push\s*\(/g;

/**
 * Arrays an arbitrary caller can grow.
 *
 * One level of call graph, not just the function bodies themselves. althea's
 * LiquidInfrastructureERC20 grows `holders` inside `_beforeTokenTransfer`,
 * which every ordinary token transfer reaches — and the paid finding is
 * precisely that the holders array can be manipulated that way. A direct-push
 * check looks at the unguarded external functions, sees no `push`, and misses
 * it. Hooks are where this bug lives, because a hook is the one place a
 * contract accumulates state on behalf of callers it never named.
 *
 * Stopping at one level is deliberate. It covers the hook case and the
 * `external f() { _add(x); }` case, which is where the pattern actually
 * appears, without a transitive walk whose precision nothing here could check.
 */
function callerGrowableArrays(contractBody: string): Set<string> {
  const grown   = new Set<string>();
  const viaName = new Map<string, string[]>();   // internal fn -> arrays it pushes
  const open: Array<{ name: string; body: string }> = [];

  for (const fn of splitFunctions(contractBody)) {
    const external = /\b(?:external|public)\b/.test(fn.header);
    const pushed   = [...fn.body.matchAll(PUSHES)].map(m => m[1]);

    if (external && !guardOf(fn.header, fn.body)) {
      for (const a of pushed) grown.add(a);
      open.push({ name: fn.name, body: fn.body });
    } else if (!external && pushed.length) {
      // Internal helpers and hooks. A guarded internal function is still
      // reachable through whatever guarded it, so the guard is not checked
      // here — reachability from an *unguarded* caller is what decides it.
      viaName.set(fn.name, pushed);
    }
  }

  // Solidity calls transfer hooks itself, so no caller names them. Any
  // unguarded state-changing entry point reaches them.
  const HOOKS = /^(?:_beforeTokenTransfer|_afterTokenTransfer|_update|_beforeTransfer|_afterTransfer|_transfer|_mint|_burn)$/;

  for (const [name, arrays] of viaName) {
    const reached = HOOKS.test(name) || open.some(f => new RegExp(`\\b${name}\\s*\\(`).test(f.body));
    if (reached) for (const a of arrays) grown.add(a);
  }

  return grown;
}

export function checkDos(file: RepoFile): Finding[] {
  if (langOf(file.path) !== 'solidity') return [];

  const src = stripComments(file.content);
  const findings: Finding[] = [];

  for (const c of splitContracts(src)) {
    if (c.kind === 'interface') continue;

    const growable = callerGrowableArrays(c.body);

    for (const fn of splitFunctions(c.body)) {
      for (const loop of loops(fn.body)) {
        // try/catch around the call is the fix, so its presence means the
        // author already considered this and isolated the failure.
        const isolated = /\btry\b/.test(loop.body);

        if (!isolated && hasVaryingRecipientTransfer(loop.body)) {
          findings.push({
            id:         'SOL-DOS-002',
            severity:   'MEDIUM',
            confidence: 'MEDIUM',
            title:      `Batch transfer in ${fn.name}() reverts for everyone if one recipient fails`,
            detail:
              `\`${fn.name}()\` moves value inside a loop with no per-iteration failure isolation. ` +
              `A transfer to any single recipient that reverts — a USDC or USDT blacklist, a contract with a reverting \`receive\`, a token that returns false, a recipient that runs out of gas — takes the whole transaction with it. ` +
              `Where the loop drains a queue in order, the first failing entry blocks every entry behind it permanently, not just its own.`,
            location:   `${file.path} → ${c.name}.${fn.name}()`,
            fix:
              'Wrap the per-recipient call in `try`/`catch` and record the failure instead of reverting, or switch to a pull-payment design where each recipient claims their own balance. ' +
              'If a batch must stay atomic, let the caller skip a named index so one bad recipient cannot hold the queue.',
            refs:       ['SWC-113', 'CWE-703', 'https://github.com/d-xo/weird-erc20#tokens-with-blocklists'],
          });
        }

        // Unbounded iteration over something an arbitrary caller can extend.
        //
        // Skipped for view and pure functions. The gas ceiling still applies to
        // an on-chain caller, but the victim is then whoever chose to call it,
        // and an off-chain reader can paginate freely. Reporting every getter
        // that walks a list would bury the state-changing cases that matter.
        const over = /\b(\w+)(?:\s*\[[^\]]*\])*\s*\.\s*length\b/.exec(loop.head);
        if (over && growable.has(over[1]) && !/\b(?:view|pure)\b/.test(fn.header)) {
          findings.push({
            id:         'SOL-DOS-003',
            severity:   'MEDIUM',
            confidence: 'MEDIUM',
            title:      `${fn.name}() iterates ${over[1]}, which any caller can grow without limit`,
            detail:
              `\`${fn.name}()\` loops over \`${over[1]}\`, and this contract lets an unguarded external function push onto it. ` +
              `An attacker can append entries until the loop no longer fits in a block, after which every call that has to iterate it reverts on gas — permanently, since the array cannot be shortened faster than it was grown.`,
            location:   `${file.path} → ${c.name}.${fn.name}()`,
            fix:
              `Cap \`${over[1]}\`'s length at push time, charge a cost per entry that makes bulk insertion uneconomic, or paginate the loop so the caller supplies the range. ` +
              'Guarding the pushing function is the other answer where the entries are not meant to be permissionless.',
            refs:       ['SWC-128', 'CWE-400'],
          });
        }
      }
    }
  }

  return findings;
}
