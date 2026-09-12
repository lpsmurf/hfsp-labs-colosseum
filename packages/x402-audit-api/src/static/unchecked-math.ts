import type { RepoFile } from '../github.js';
import type { Finding } from '../report.js';
import { langOf, splitFunctions, stripComments, uncheckedBlocks } from '../lang.js';

// `unchecked` arithmetic.
//
// Derived from a derive-half finding: a stablecoin DEX debited a user balance
// inside `unchecked { balances[user][token] -= amount; }` with nothing upstream
// establishing that the balance covered the amount. Solidity 0.8 would have
// reverted on the underflow; `unchecked` turns it into a balance near 2^256,
// which is a mint. The platform had no rule that could see this at all.
//
// Scope is deliberately narrow, and the narrowing is the whole design:
//
//   * Subtraction only. Unchecked *addition* on a uint256 is almost never
//     reachable — you cannot accumulate 2^256 of anything — so flagging it
//     would generate noise at the rate `unchecked` appears in the wild.
//   * `-=` and `a - b` only, never `--`. A reverse loop counter (`i--`) is the
//     single most common thing inside `unchecked` and is always safe.
//   * Guard search is per-function and generous. If anything upstream compares
//     the subtrahend against anything, the block is treated as guarded. That
//     costs recall and buys precision, which is the correct trade for a rule
//     that would otherwise fire on every gas-optimised contract written since
//     0.8 shipped.

// A subtraction that writes to something that looks like storage: a mapping
// entry, a struct member, or a bare identifier. Local-variable declarations are
// excluded by the type-keyword veto below.
const SUB_ASSIGN = /([A-Za-z_]\w*(?:\s*\[[^\]]*\]|\s*\.\s*\w+)*)\s*-=\s*([^;]+);/g;

// `x = a - b` where the result is assigned rather than compound-subtracted.
const SUB_EXPR = /([A-Za-z_]\w*(?:\s*\[[^\]]*\]|\s*\.\s*\w+)*)\s*=\s*([A-Za-z_][\w.[\]]*)\s*-\s*([A-Za-z_][\w.[\]]*)\s*;/g;

// Loop arithmetic. `unchecked { ++i }` and its variants carry no risk, and the
// index bound is the loop condition itself.
const LOOP_ONLY = /^[\s{}]*(?:\+\+|--)?\s*\w+\s*(?:\+\+|--)?\s*;?[\s{}]*$/;

/** The bare name of a subtraction target or operand, for guard matching. */
function rootName(expr: string): string {
  return expr.trim().replace(/\s*\[[\s\S]*$/, '').replace(/\s*\.\s*[\s\S]*$/, '');
}

/**
 * Did anything before this point bound the subtraction?
 *
 * Deliberately loose. Any comparison, require, if-revert, min(), or explicit
 * cap that mentions either side of the subtraction counts. The rule is trying
 * to find the case where *nothing* was checked, not to adjudicate whether the
 * check was correct — that needs a human, and a rule that second-guesses the
 * bound would be wrong far more often than it was right.
 */
function boundedUpstream(before: string, target: string, subtrahend: string): boolean {
  // No minimum length. A `n.length > 1` filter was tried and silently dropped
  // every single-letter identifier, so `require(b[msg.sender] >= a)` looked
  // like no guard at all and the rule fired on correct code. Substring
  // collisions are handled by the word boundaries below, not by a length cut.
  const names = [rootName(target), rootName(subtrahend)].filter(n => n.length > 0);

  for (const n of names) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // A comparison against this name in either direction, anywhere upstream.
    // The index/member chain has to be allowed between the name and the
    // operator: the check on a mapping balance is written
    // `require(balances[msg.sender][token] >= amount)`, and a regex expecting
    // the operator to follow the bare identifier misses every one of them.
    const chain = '(?:\\s*\\[[^\\]]*\\]|\\s*\\.\\s*\\w+)*';
    const cmp   = '(?:>=|<=|>|<|==|!=)';
    // `\b` here brackets a whole identifier, which is safe — the trap is using
    // it before a *suffix* (`\bnonce` never matches `_useNonce`, because `_` is
    // a word character), and that is not what this does.
    if (new RegExp(`\\b${esc}\\b${chain}\\s*${cmp}|${cmp}\\s*\\b${esc}\\b${chain}`).test(before)) {
      return true;
    }
    // Clamped rather than compared: `amount = Math.min(amount, balance)`.
    if (new RegExp(`\\bmin\\s*\\([^)]*\\b${esc}\\b`, 'i').test(before)) return true;
  }

  // The bound was established by an earlier *checked* subtraction of the same
  // amount. solmate's ERC20._burn is the canonical case:
  //
  //     balanceOf[from] -= amount;        // checked: reverts on underflow
  //     unchecked { totalSupply -= amount; }
  //
  // The second subtraction cannot underflow because the first already proved
  // the balance covered it, and no balance can exceed the supply. This idiom is
  // in solmate, OpenZeppelin and most token implementations written since 0.8,
  // so a rule that cannot see it fires on nearly every ERC-20 in existence.
  const sub = rootName(subtrahend);
  if (sub && new RegExp(`-=\\s*\\b${sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(before)) {
    return true;
  }

  // A SafeCast or explicit revert naming the shortfall.
  return /Insufficient|ExceedsBalance|NotEnough|Underflow/i.test(before);
}

export function checkUncheckedMath(file: RepoFile): Finding[] {
  if (langOf(file.path) !== 'solidity') return [];

  const src = stripComments(file.content);
  if (!/\bunchecked\s*\{/.test(src)) return [];

  const findings: Finding[] = [];

  for (const fn of splitFunctions(src)) {
    for (const blk of uncheckedBlocks(fn.body)) {
      if (LOOP_ONLY.test(blk.body)) continue;

      // Everything the function did before entering this block. `blk.at` is an
      // offset into the function body, which is what makes "upstream" mean
      // upstream rather than anywhere in the file.
      const before = fn.header + fn.body.slice(0, blk.at);

      const hits: Array<{ target: string; subtrahend: string; expr: string }> = [];

      for (const m of blk.body.matchAll(SUB_ASSIGN)) {
        hits.push({ target: m[1], subtrahend: m[2], expr: m[0].trim() });
      }
      for (const m of blk.body.matchAll(SUB_EXPR)) {
        // A local declaration is a fresh variable, not a balance being debited.
        if (/\b(?:uint\d*|int\d*|bool|address|bytes\d*|string)\s+$/.test(
          blk.body.slice(0, (m.index ?? 0)).split('\n').pop() ?? '')) continue;
        hits.push({ target: m[1], subtrahend: m[3], expr: m[0].trim() });
      }

      for (const hit of hits) {
        if (boundedUpstream(before, hit.target, hit.subtrahend)) continue;

        findings.push({
          id:         'SOL-MATH-001',
          severity:   'HIGH',
          confidence: 'MEDIUM',
          title:      `Unchecked subtraction in ${fn.name}() with no upstream bound`,
          detail:
            `\`${fn.name}()\` performs \`${hit.expr}\` inside an \`unchecked\` block, and no comparison involving ` +
            `\`${rootName(hit.target)}\` or \`${rootName(hit.subtrahend)}\` was found earlier in the function. ` +
            `Outside \`unchecked\`, Solidity 0.8 reverts when a subtraction goes below zero; inside it, the value wraps to near 2^256. ` +
            `Where the target is a balance or a supply, that wrap is not a rounding error — it is an unbounded credit.`,
          location:   `${file.path} → ${fn.name}()`,
          fix:
            'Either drop the `unchecked` — the checked path costs ~20 gas and the compiler does the bound for you — or establish the bound explicitly first ' +
            '(`require(balance >= amount, "insufficient")`) so the `unchecked` block is provably safe and says why in a comment.',
          refs:       ['SWC-101', 'CWE-191', 'https://docs.soliditylang.org/en/latest/control-structures.html#checked-or-unchecked-arithmetic'],
        });
      }
    }
  }

  return findings;
}
