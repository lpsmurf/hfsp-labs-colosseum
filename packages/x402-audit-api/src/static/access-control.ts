import type { RepoFile } from '../github.js';
import type { Finding } from '../report.js';
import { langOf, splitContracts, splitFunctions, stripComments } from '../lang.js';

// Access control.
//
// Derived from the derive half of the corpus split (x402-audit/experiments/),
// where "missing or broken access control" is the largest class of paid finding
// that a pattern rule can actually reach — 4 of 78, against 17 accounting bugs
// no regex will ever see. The concrete case that motivated it is a fee-splitter
// whose `setCurves` was `external` with no guard at all, which none of the
// existing rules could reach: SOL-PROXY-001 only looks at initializers, and
// SOL-INPUT-001 checks privileged setters for a zero-address check while
// assuming they are privileged in the first place.
//
// The hard part is not finding unguarded external functions. It is that *most*
// unguarded external functions are correct — `deposit`, `swap`, `mint` on a pool
// are permissionless by design, and flagging them would bury the report. So the
// rules here fire only where the function's own name says it is administrative.
// Everything else goes into the inventory instead, which claims nothing and just
// hands an auditor the table they would otherwise build by hand.

// ---------------------------------------------------------------------------
// Guard detection
// ---------------------------------------------------------------------------

// Modifiers that are not access control. Everything else in a modifier slot is
// treated as a guard, because a single file cannot tell us what an unfamiliar
// modifier does and guessing wrong invents a CRITICAL. SOL-PROXY-001 learned
// this the expensive way: it accused UniswapV2Pair and UniswapV3Pool of
// unprotected initializers because both guard with an idiom OpenZeppelin does
// not use.
const NON_GUARD_MODIFIERS = new Set([
  'external', 'public', 'internal', 'private',
  'view', 'pure', 'payable', 'constant',
  'virtual', 'override', 'returns',
  // Reentrancy and pause modifiers restrict *when*, never *who*. Counting them
  // as access control would hide exactly the bug this engine is for.
  'nonReentrant', 'nonReentrantView', 'lock',
  'whenNotPaused', 'whenPaused', 'notPaused',
  'ensure', 'ensures', 'checkDeadline',
]);

// Caller-identity checks written in the body rather than as a modifier.
//
// Every alternative here has to be specific about *comparing* the caller, not
// merely mentioning it. A looser `(msg.sender)` alternative was tried first and
// counted `deposits[msg.sender] += amount` as an access-control guard, which
// would have marked most of a protocol's permissionless surface as protected —
// the inventory's central number, silently wrong.
const BODY_GUARD = new RegExp([
  // Direct caller comparison, either operand order.
  /\bmsg\.sender\s*(?:==|!=)|(?:==|!=)\s*msg\.sender\b/.source,
  /_msgSender\s*\(\s*\)\s*(?:==|!=)|(?:==|!=)\s*_msgSender\s*\(\s*\)/.source,
  // OpenZeppelin and common internal assertion helpers.
  /\b_check(?:Owner|Role|Admin|Access)\b|\b_authorizeUpgrade\b|\b_requireOwner\b/.source,
  /\bhasRole\s*\(|\b_onlyGov\w*\b|\bisAuthori[sz]ed\s*\(|\b_authOnly\b/.source,
  // A bare boolean role lookup: `require(operators[msg.sender], ...)` or
  // `if (!operators[msg.sender]) revert`. The absence of a comparison operator
  // is what separates this from `require(balance[msg.sender] >= amount)`.
  /\brequire\s*\(\s*!?\s*\w+\s*\[\s*(?:msg\.sender|_msgSender\s*\(\s*\))\s*\]\s*[,)]/.source,
  /\bif\s*\(\s*!\s*\w+\s*\[\s*(?:msg\.sender|_msgSender\s*\(\s*\))\s*\]\s*\)/.source,
  // A privileged address compared as the first operand of a require.
  /\brequire\s*\(\s*(?:owner|admin|governance|_owner|_admin|_governance)\b/.source,
].join('|'), 'i');

/**
 * The part of a function header that carries modifiers.
 *
 * `header` runs from `function` to the opening brace, so it still contains the
 * parameter list — and parameters routinely mention types and names that look
 * like modifiers. Skip past the balanced parameter parens first.
 */
function modifierSlot(header: string): string {
  const open = header.indexOf('(');
  if (open === -1) return '';

  let depth = 0;
  let i = open;
  for (; i < header.length; i++) {
    if (header[i] === '(') depth++;
    else if (header[i] === ')') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }

  // `returns (...)` is a declaration, not a modifier, and its contents are
  // types. Drop it before tokenising.
  return header.slice(i).replace(/\breturns\s*\([^)]*\)/g, ' ');
}

// The caller bound to a local first, then compared. OpenZeppelin writes
//
//     address caller = _msgSender();
//     if (caller != authority()) revert AccessManagedUnauthorized(caller);
//
// so the comparison never mentions msg.sender at all. Both AccessManaged
// .setAuthority and TimelockController.updateDelay were reported as unguarded
// HIGHs for exactly this, and the idiom is throughout OZ 5.x.
const CALLER_ALIAS = /\b(?:address\s+)?(\w+)\s*=\s*(?:_msgSender\s*\(\s*\)|msg\.sender)\s*;/g;

function aliasCompared(body: string): string | null {
  for (const m of body.matchAll(CALLER_ALIAS)) {
    const name = m[1];
    if (new RegExp(`\\b${name}\\b\\s*(?:==|!=)|(?:==|!=)\\s*\\b${name}\\b`).test(body)) {
      return `${name} (alias of msg.sender)`;
    }
  }
  return null;
}

/** The guard protecting a function, or null if none was found. */
export function guardOf(header: string, body: string): string | null {
  for (const tok of modifierSlot(header).match(/\b[A-Za-z_]\w*\b/g) ?? []) {
    if (!NON_GUARD_MODIFIERS.has(tok)) return tok;
  }
  const m = BODY_GUARD.exec(body);
  if (m) return m[0].trim();
  return aliasCompared(body);
}

// A setter that writes the *caller's own* record needs no access control: the
// caller is the subject, so there is nobody else's state to protect. This is
// not a corner case — `ERC721.setApprovalForAll`, `ERC1155.setApprovalForAll`,
// `ERC6909.setOperator`, `Pool.setUserEMode` and
// `Pool.setUserUseReserveAsCollateral` are all this shape, and all five were
// reported as unguarded HIGHs.
//
// `emit` is stripped first. An event argument mentioning msg.sender is not the
// function operating on the caller's record, and leaving it in would suppress
// genuine findings in any contract that logs who called.
function writesCallerOwnRecord(body: string): boolean {
  const withoutEvents = body.replace(/\bemit\s+[^;]*;/g, ';');
  return /\bmsg\.sender\b|_msgSender\s*\(\s*\)/.test(withoutEvents);
}

/**
 * A thin wrapper that forwards to its own overload.
 *
 * aave's L2Pool exists to accept calldata-compressed arguments:
 *
 *     function setUserUseReserveAsCollateral(bytes32 args) external override {
 *       (address asset, bool use) = CalldataLogic.decode...(args);
 *       setUserUseReserveAsCollateral(asset, use);   // the inherited one
 *     }
 *
 * Whatever guard and whatever scope the real function has, this inherits. Both
 * live in the callee, which single-file analysis cannot see, so reporting the
 * wrapper is reporting the absence of evidence. Self-recursion in a setter is
 * not a thing, so matching the function's own name is safe.
 */
function forwardsToOverload(name: string, body: string): boolean {
  return new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`).test(body);
}

// ---------------------------------------------------------------------------
// What counts as administrative
// ---------------------------------------------------------------------------

// Configuration writes. A protocol parameter, address or rate being settable by
// anyone is the bug class this engine exists for.
const CONFIG_FN =
  /^(?:set|update|change|configure|register|whitelist|blacklist|allow|deny)[A-Z_]|^(?:set|update|configure)$/;

// Functions that move assets the caller has no claim to. `withdraw` is
// deliberately absent — a user withdrawing their own deposit is the normal case
// and the most common permissionless function in DeFi.
//
// `skim` is absent for the same reason. In AMMs it is a term of art for "take
// the surplus above the recorded reserves", which is permissionless by design
// in Uniswap v2 and every fork of it; the rule reported UniswapV2Pair.skim()
// and that was its only finding on the repo.
const SWEEP_FN =
  /^(?:sweep|rescue|recover|drain|seize|reclaim|emergency|withdrawAll|withdrawTo|withdrawToken|collectFees?|claimFees?|retrieve)/i;

// Lifecycle switches. Lower severity than the two above: a griefer can pause a
// protocol but cannot take from it, and some designs deliberately let anyone
// trip the brake.
const LIFECYCLE_FN =
  /^(?:pause|unpause|freeze|unfreeze|halt|resume|shutdown|kill|enable|disable|migrate|upgrade(?:To)?)/i;

// A function writes storage if it is not declared view or pure. Solidity
// enforces this, so it needs no heuristic — which is why the inventory can be
// stated as fact rather than as a guess.
function isStateChanging(header: string): boolean {
  return !/\b(?:view|pure|constant)\b/.test(modifierSlot(header));
}

function isExternallyReachable(header: string): 'external' | 'public' | null {
  const slot = modifierSlot(header);
  if (/\bexternal\b/.test(slot)) return 'external';
  if (/\bpublic\b/.test(slot))   return 'public';
  // Solidity 0.5+ requires explicit visibility on functions, so an absent
  // keyword means internal-by-convention in modern code. Treating it as public
  // would flood the inventory with internal helpers.
  return null;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export interface SurfaceFn {
  file:       string;
  contract:   string;
  fn:         string;
  visibility: 'external' | 'public';
  /** The modifier or body check protecting it, or null. */
  guard:      string | null;
  payable:    boolean;
  /**
   * 'caller' when the body only ever keys state off the caller's own address,
   * so being open is correct by construction. 'global' when it is not, which
   * is the subset a reviewer has to read.
   */
  scope:      'caller' | 'global';
}

export interface AttackSurface {
  /** External/public state-changing functions found across every file. */
  total:      number;
  guarded:    number;
  unguarded:  number;
  /**
   * Of the unguarded ones, how many touch state beyond the caller's own. This
   * is the number worth looking at: a protocol can have forty open functions
   * and be entirely correct if every one of them is per-caller.
   */
  unguardedGlobal: number;
  /** Only the unguarded ones — the guarded majority is not what gets read. */
  open:       SurfaceFn[];
  /** True when `open` was capped, so a caller does not read it as complete. */
  truncated:  boolean;
}

// A full listing of a large protocol is thousands of rows and nobody reads past
// the first page. Cap it and say so.
const MAX_SURFACE_ROWS = 250;

/**
 * Every externally reachable state-changing function, and whether it is guarded.
 *
 * This is a measurement, not a finding: an unguarded external function is how
 * almost every protocol is supposed to work. It goes in the report as a section
 * so that the question an auditor asks first — "what can an arbitrary address
 * call?" — is answered without them grepping for it.
 */
export function accessControlInventory(files: RepoFile[]): AttackSurface {
  const open: SurfaceFn[] = [];
  let total = 0;
  let guarded = 0;
  let unguardedGlobal = 0;

  for (const file of files) {
    if (langOf(file.path) !== 'solidity') continue;
    const src = stripComments(file.content);

    for (const c of splitContracts(src)) {
      // An interface declares no behaviour and a library holds no storage, so
      // neither has a surface to report.
      if (c.kind === 'interface' || c.kind === 'library') continue;

      for (const fn of splitFunctions(c.body)) {
        const vis = isExternallyReachable(fn.header);
        if (!vis || !isStateChanging(fn.header)) continue;

        total++;
        const guard = guardOf(fn.header, fn.body);
        if (guard) { guarded++; continue; }

        const scope = writesCallerOwnRecord(fn.body) ? 'caller' : 'global';
        if (scope === 'global') unguardedGlobal++;

        if (open.length < MAX_SURFACE_ROWS) {
          open.push({
            file:       file.path,
            contract:   c.name,
            fn:         fn.name,
            visibility: vis,
            guard:      null,
            payable:    /\bpayable\b/.test(modifierSlot(fn.header)),
            scope,
          });
        }
      }
    }
  }

  return {
    total,
    guarded,
    unguarded: total - guarded,
    unguardedGlobal,
    open,
    truncated: total - guarded > open.length,
  };
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export function checkAccessControl(file: RepoFile): Finding[] {
  if (langOf(file.path) !== 'solidity') return [];

  const src = stripComments(file.content);
  const findings: Finding[] = [];

  for (const c of splitContracts(src)) {
    if (c.kind === 'interface' || c.kind === 'library') continue;

    for (const fn of splitFunctions(c.body)) {
      const vis = isExternallyReachable(fn.header);
      if (!vis || !isStateChanging(fn.header)) continue;
      if (guardOf(fn.header, fn.body)) continue;

      // An empty body cannot be abused, and abstract contracts declare
      // functions their children implement.
      if (!/[^\s{}]/.test(fn.body)) continue;

      // The caller is the subject, so there is no third party to protect.
      if (writesCallerOwnRecord(fn.body)) continue;

      // The guard is in the function this one forwards to.
      if (forwardsToOverload(fn.name, fn.body)) continue;

      const where = `${file.path} → ${c.name}.${fn.name}()`;

      if (CONFIG_FN.test(fn.name)) {
        findings.push({
          id:         'SOL-AC-001',
          severity:   'HIGH',
          confidence: 'MEDIUM',
          title:      `Configuration setter ${fn.name}() has no access control`,
          detail:
            `\`${c.name}.${fn.name}()\` is ${vis} and writes state, and no guard was found — no access-control modifier, no \`msg.sender\` check, no role check. ` +
            `Its name says it changes protocol configuration, so any address can rewrite whatever it sets: a fee, a rate, an oracle, a payout split. ` +
            `Confirm whether the guard lives in an inherited modifier this file does not define.`,
          location:   where,
          fix:        'Gate it on the privileged role — `onlyOwner`, `onlyRole(...)`, or an explicit `require(msg.sender == governance)`. If it is deliberately permissionless, say so in a comment so the next reader does not have to re-derive that.',
          refs:       ['SWC-105', 'CWE-862'],
        });
        continue;
      }

      if (SWEEP_FN.test(fn.name)) {
        findings.push({
          id:         'SOL-AC-002',
          severity:   'HIGH',
          confidence: 'MEDIUM',
          title:      `Asset-recovery function ${fn.name}() has no access control`,
          detail:
            `\`${c.name}.${fn.name}()\` is ${vis}, writes state and is named as a sweep, rescue or fee-collection function, but no caller check was found. ` +
            `Functions of this shape move balances the caller has no per-account claim to, so without a guard the destination — or the whole balance — is attacker-chosen.`,
          location:   where,
          fix:        'Restrict it to the treasury role, and send the proceeds to a stored recipient rather than to `msg.sender` so a missing guard cannot become a direct theft.',
          refs:       ['SWC-105', 'CWE-862'],
        });
        continue;
      }

      if (LIFECYCLE_FN.test(fn.name)) {
        findings.push({
          id:         'SOL-AC-003',
          severity:   'MEDIUM',
          confidence: 'LOW',
          title:      `Lifecycle control ${fn.name}() has no access control`,
          detail:
            `\`${c.name}.${fn.name}()\` is ${vis} and appears to switch the contract between operating states, with no caller check found. ` +
            `Anyone able to call it can halt the protocol, or lift a halt that was protecting it. Reported at low confidence: some designs let any address trip the brake on purpose.`,
          location:   where,
          fix:        'Gate pause on an operator role and unpause on a stricter one — the asymmetry matters, because the cost of a wrongful pause is downtime and the cost of a wrongful unpause is the incident continuing.',
          refs:       ['SWC-105', 'CWE-862'],
        });
      }
    }
  }

  return findings;
}
