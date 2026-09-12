import type { RepoFile } from '../github.js';
import type { Finding } from '../report.js';
import { langOf, splitFunctions, stripComments } from '../lang.js';

// EVM rule set. Rules are drawn from the SWC Registry, transmissions11/solcurity,
// crytic/not-so-smart-contracts and SunWeb3Sec/DeFiVulnLabs — the primary sources
// behind shanzson/Smart-Contract-Auditor-Tools-and-Techniques.
//
// These are pattern rules, not a compiler. They read one file at a time with no
// type resolution, no inheritance graph and no call graph, so they find the
// shapes of known bug classes and nothing deeper. Slither and Aderyn remain the
// tools for anything needing real analysis; this layer exists to triage a repo
// in seconds before a human spends an hour on it. Every rule carries a
// confidence so the report says which findings it is actually sure about.

interface SolRule {
  id:         string;
  re:         RegExp;
  severity:   Finding['severity'];
  confidence: NonNullable<Finding['confidence']>;
  title:      string;
  detail:     string;
  fix:        string;
  refs:       string[];
  // Optional gate: rule only fires if this also matches the file.
  requires?:  RegExp;
  // Optional veto: rule is suppressed if this matches the file.
  unless?:    RegExp;
}

const FILE_RULES: SolRule[] = [
  {
    id:         'SOL-AUTH-001',
    re:         /(?:require|if)\s*\([^)]*\btx\.origin\b|\btx\.origin\s*==|==\s*\btx\.origin\b/,
    severity:   'HIGH',
    confidence: 'HIGH',
    title:      'Authorization uses tx.origin',
    detail:     '`tx.origin` is the transaction signer, not the immediate caller. Any contract the victim is tricked into calling can forward the call and pass this check, so the guard does not restrict who can act.',
    fix:        'Use `msg.sender` for authorization. `tx.origin` has no safe use as an access-control primitive.',
    refs:       ['SWC-115', 'CWE-863'],
  },
  // SOL-CALL-001 is not a table rule — see uncheckedLowLevelCall(). A
  // line-anchored regex cannot tell a discarded result from an assignment split
  // across two lines, which is how Uniswap v3's TransferHelper is written.
  {
    id:         'SOL-ERC20-001',
    // Bare transfer/transferFrom/approve on a token, result unchecked. Gated on
    // the file actually dealing in ERC-20s so payable(x).transfer(v) is excluded.
    re:         /^[ \t]*(?!.*\bsafe(?:Transfer|TransferFrom|Approve)\b)[\w.[\]()]*\.(?:transferFrom|transfer|approve)\s*\(/m,
    requires:   /\bIERC20\b|\bERC20\b|SafeERC20/,
    unless:     /payable\s*\([^)]*\)\s*\.transfer/,
    severity:   'HIGH',
    confidence: 'MEDIUM',
    title:      'Unchecked ERC-20 transfer return value',
    detail:     'ERC-20 `transfer`/`transferFrom`/`approve` return a bool and a number of widely held tokens report failure that way instead of reverting. Ignoring the return value means a failed transfer is credited as if the funds had moved.',
    fix:        'Use OpenZeppelin `SafeERC20` (`safeTransfer`, `safeTransferFrom`, `forceApprove`), which reverts on both a `false` return and a missing return value.',
    refs:       ['SWC-104', 'https://github.com/d-xo/weird-erc20'],
  },
  {
    id:         'SOL-RAND-001',
    re:         /keccak256\s*\([^;]{0,200}\bblock\.(?:timestamp|number|difficulty|prevrandao|coinbase)\b|\bblockhash\s*\(/,
    severity:   'HIGH',
    confidence: 'MEDIUM',
    title:      'Randomness derived from block properties',
    detail:     'Block values are known to, or influenceable by, the proposer and are readable by any contract in the same transaction. An attacker can simulate the outcome and only commit when it favours them.',
    fix:        'Use a commit-reveal scheme or an external VRF (e.g. Chainlink VRF). No on-chain block property is a source of randomness.',
    refs:       ['SWC-120', 'CWE-330'],
  },
  {
    id:         'SOL-SIG-001',
    re:         /\becrecover\s*\(/,
    // A zero-address check is the half that actually matters; without a nonce
    // the replay rule (SOL-SIG-002) covers the rest. Uniswap V2's permit checks
    // `recoveredAddress != address(0)` and was being reported anyway.
    unless:     /ECDSA\.(?:recover|tryRecover)|require\s*\([^)]*\bv\b\s*==\s*27|_v\s*==\s*27|!=\s*address\s*\(\s*0\s*\)/,
    severity:   'MEDIUM',
    confidence: 'MEDIUM',
    title:      'Raw ecrecover without zero-address or malleability handling',
    detail:     'Called directly, `ecrecover` returns `address(0)` for a malformed signature rather than reverting, and accepts both the high and low `s` values for the same key — so one valid signature has a second, different encoding.',
    fix:        'Use OpenZeppelin `ECDSA.recover`, which rejects the upper-range `s` and reverts instead of returning the zero address. At minimum, reject `address(0)` explicitly.',
    refs:       ['SWC-117', 'SWC-121'],
  },
  {
    id:         'SOL-HASH-001',
    re:         /keccak256\s*\(\s*abi\.encodePacked\s*\(([^)]*,[^)]*)\)/,
    requires:   /encodePacked\s*\([^)]*\b(?:string|bytes|\[\])\b/,
    severity:   'MEDIUM',
    confidence: 'MEDIUM',
    title:      'Hash collision risk in abi.encodePacked with dynamic types',
    detail:     '`abi.encodePacked` concatenates without length prefixes, so two different argument lists can produce identical bytes — `("a","bc")` and `("ab","c")` hash the same. Where the hash authorizes something, that is a forgery.',
    fix:        'Use `abi.encode` instead, which length-prefixes each dynamic argument, or hash a single fixed-layout struct.',
    refs:       ['SWC-133', 'CWE-294'],
  },
  {
    id:         'SOL-ORACLE-001',
    // Must be a call *on another contract*. A bare `getReserves(` also matches
    // the AMM's own definition of it, which reported UniswapV2Pair for reading
    // its own reserves — the rule is about consumers of a spot price, not the
    // pool that publishes one.
    re:         /\.\s*(?:getReserves|getAmountsOut|getAmountsIn|slot0)\s*\(|\.\s*price[01]CumulativeLast/,
    unless:     /function\s+(?:getReserves|slot0)\s*\(/,
    severity:   'HIGH',
    confidence: 'MEDIUM',
    title:      'Pricing read from an AMM spot price',
    detail:     'Pool reserves and `slot0` are instantaneous state and can be moved within a single transaction with a flash loan. Pricing collateral or payouts from them lets an attacker set the price they are paid at.',
    fix:        'Price against a manipulation-resistant feed (Chainlink, or a TWAP over enough blocks), and validate staleness and deviation bounds on whatever you read.',
    refs:       ['https://github.com/0xcacti/awesome-oracle-manipulation', 'https://samczsun.com/so-you-want-to-use-a-price-oracle/'],
  },
  {
    id:         'SOL-DELEGATE-001',
    re:         /\.delegatecall\s*\(/,
    severity:   'HIGH',
    confidence: 'LOW',
    title:      'delegatecall present — verify the target cannot be influenced',
    detail:     '`delegatecall` runs the callee\'s code against this contract\'s storage and balance. If the target address can be set or influenced by a caller, that is total control of the contract.',
    fix:        'Confirm the target is immutable or admin-only, and that storage layouts cannot collide. Flagged for review rather than as a confirmed defect.',
    refs:       ['SWC-112', 'https://github.com/naddison36/sol2uml'],
  },
  {
    id:         'SOL-DOS-001',
    re:         /\bselfdestruct\s*\(/,
    severity:   'MEDIUM',
    confidence: 'HIGH',
    title:      'selfdestruct present',
    detail:     'Reachable `selfdestruct` can permanently remove the contract, bricking every integration that depends on it. It also lets anyone force-send ETH into a contract, breaking invariants that assume balance only changes through its own functions.',
    fix:        'Remove it, or gate it behind the strictest access control available. Note that post-Cancun `SELFDESTRUCT` no longer clears code except in the deployment transaction.',
    refs:       ['SWC-106'],
  },
  {
    id:         'SOL-GAS-001',
    re:         /payable\s*\([^)]*\)\s*\.(?:transfer|send)\s*\(|\.transfer\s*\(\s*(?:address\s*\()?\s*(?:msg\.value|amount|_amount)/,
    severity:   'LOW',
    confidence: 'MEDIUM',
    title:      'ETH sent with a fixed 2300 gas stipend',
    detail:     '`transfer` and `send` forward only 2300 gas. Any recipient whose receive hook costs more than that — most smart contract wallets and multisigs — cannot be paid, which can permanently strand a withdrawal.',
    fix:        'Use `call{value: v}("")` with an explicit success check, and follow checks-effects-interactions or a pull-payment pattern to stay reentrancy-safe.',
    refs:       ['SWC-134'],
  },
  {
    id:         'SOL-PRAGMA-001',
    re:         /pragma\s+solidity\s+[\^>~]/,
    // Only deployable contracts. Libraries, interfaces and abstract bases float
    // their pragma on purpose so downstream projects can compile them — firing
    // here produced 50 of 52 findings on openzeppelin-contracts, all noise.
    requires:   /(?<!abstract\s)\bcontract\s+\w+/,
    severity:   'INFO',
    confidence: 'HIGH',
    title:      'Floating pragma',
    detail:     'A caret or range pragma lets the contract be compiled with a compiler version it was never tested or audited against, including versions with known codegen bugs.',
    fix:        'Pin an exact version (`pragma solidity 0.8.26;`) and match it in foundry.toml / hardhat.config.',
    refs:       ['SWC-103'],
  },
  {
    id:         'SOL-APPROVE-001',
    re:         /\.approve\s*\([^,)]*,\s*(?:type\s*\(\s*uint256\s*\)\s*\.max|2\s*\*\*\s*256\s*-\s*1|uint256\s*\(\s*-1\s*\))/,
    severity:   'LOW',
    confidence: 'HIGH',
    title:      'Unlimited token approval',
    detail:     'An infinite approval means a later bug or upgrade in the spender puts the full balance at risk, not just the amount actually needed.',
    fix:        'Approve the exact amount required per operation, and reset to zero afterwards where the integration allows it.',
    refs:       ['https://github.com/transmissions11/solcurity'],
  },
  {
    id:         'SOL-4626-001',
    re:         /\bERC4626\b|function\s+convertToShares\s*\(/,
    severity:   'INFO',
    confidence: 'LOW',
    title:      'ERC-4626 vault — check the inflation / first-depositor attack',
    detail:     'ERC-4626 share maths rounds in a way that lets the first depositor donate assets directly to the vault and inflate the share price, so subsequent small deposits round down to zero shares and their assets are captured.',
    fix:        'Use OpenZeppelin\'s ERC4626 with a virtual-shares offset, or seed the vault with dead shares at deployment. Property-test with a16z/erc4626-tests.',
    refs:       ['https://docs.openzeppelin.com/contracts/5.x/erc4626#inflation-attack', 'https://github.com/a16z/erc4626-tests'],
  },
];

// Privileged setters that should reject the zero address. Losing one of these to
// address(0) is usually unrecoverable.
const PRIVILEGED_SETTER =
  /function\s+(?:set|update|change|transfer)(Owner|Admin|Treasury|Oracle|Resolver|Router|Fee[Rr]ecipient|Governance|Signer|Operator)\w*\s*\(/i;

// A low-level call whose `bool success` return is genuinely discarded.
//
// Cannot be a line-anchored regex. Uniswap v3's TransferHelper writes
//
//     (bool success, bytes memory data) =
//         token.call(abi.encodeWithSelector(...));
//
// which puts `token.call(` at the start of its own line even though the result
// is captured and checked. Instead, walk back from each call to the start of its
// statement and look for an assignment.
function uncheckedLowLevelCall(path: string, src: string): Finding[] {
  const re = /\.\s*(?:call|delegatecall|staticcall)\s*[({]/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(src)) !== null) {
    // Statement start: the nearest preceding ; { } or ) closing a control head.
    const before = src.slice(0, m.index);
    const stmtStart = Math.max(
      before.lastIndexOf(';'),
      before.lastIndexOf('{'),
      before.lastIndexOf('}'),
    );
    const stmt = before.slice(stmtStart + 1);

    // An `=` in the statement means the result was captured. `require(`,
    // `assert(` or `if (` means it is being consumed as a condition.
    if (/=|require\s*\(|assert\s*\(|\bif\s*\(|return\b/.test(stmt)) continue;

    return [{
      id:         'SOL-CALL-001',
      severity:   'HIGH',
      confidence: 'MEDIUM',
      title:      'Return value of low-level call is discarded',
      detail:     'A low-level call is made without capturing its `bool success` return. Unlike a high-level call, a low-level call does not bubble up a revert — if the callee reverts or the address has no code, execution continues as if it had succeeded.',
      location:   path,
      fix:        'Capture the result and act on it: `(bool ok, ) = target.call{value: v}(data); require(ok, "call failed");`',
      refs:       ['SWC-104', 'CWE-252'],
    }];
  }

  return [];
}

function fileRules(path: string, src: string): Finding[] {
  const findings: Finding[] = [];

  for (const rule of FILE_RULES) {
    if (rule.requires && !rule.requires.test(src)) continue;
    if (rule.unless   &&  rule.unless.test(src))   continue;
    if (!rule.re.test(src)) continue;

    findings.push({
      id:         rule.id,
      severity:   rule.severity,
      confidence: rule.confidence,
      title:      rule.title,
      detail:     rule.detail,
      location:   path,
      fix:        rule.fix,
      refs:       rule.refs,
    });
  }

  return findings;
}

// Rules that need a function body. A nonce declared in some other function does
// not stop this one from being replayable, so these cannot be file-level.
function functionRules(path: string, src: string): Finding[] {
  const findings: Finding[] = [];

  for (const fn of splitFunctions(src)) {
    const { name, header, body } = fn;

    // Reentrancy: value leaves the contract, then storage is written, with no
    // guard. Checks-effects-interactions exists precisely to prevent this.
    const externalCall = /\.call\s*\{[^}]*value\s*:|\.call\{|\.transfer\s*\(|\.send\s*\(|safeTransferFrom?\s*\(/.exec(body);
    if (externalCall && !/nonReentrant|ReentrancyGuard/.test(header + src)) {
      const after = body.slice(externalCall.index);
      // A storage write after the call: assignment to a bare or indexed name
      // that is not a local declaration.
      if (/^(?!.*\b(?:uint|int|bool|address|bytes|string|memory|calldata)\b)[ \t]*[\w.[\]]+\s*(?:=[^=]|[+\-*/]=)/m.test(after)) {
        findings.push({
          id:         'SOL-REENTRANCY-001',
          severity:   'HIGH',
          confidence: 'MEDIUM',
          title:      `State written after an external call in ${name}()`,
          detail:     `\`${name}()\` sends value or calls out to another address and then updates storage, with no reentrancy guard on the function. A malicious recipient can re-enter before the update lands and observe or exploit the stale state — the Curve and DAO pattern.`,
          location:   `${path} → ${name}()`,
          fix:        'Follow checks-effects-interactions: write all state before the external call. Add `nonReentrant` as defence in depth, and remember it does not protect against cross-function or cross-contract reentrancy.',
          refs:       ['SWC-107', 'https://github.com/pcaversaccio/reentrancy-attacks'],
        });
      }
    }

    // Signature verification with no replay protection in the same function.
    //
    // Trigger on a missing nonce only. A missing deadline or domain separator is
    // a real weakness but cannot be judged from one file: the domain usually
    // comes from an inherited EIP712 base, and some signed operations (a
    // cancellation, say) correctly have no expiry. Firing on those produced
    // false positives on ERC20Permit and ERC-3009, which are both correct.
    //
    // Note the absence of \b before "nonce": OpenZeppelin spells it _useNonce,
    // where there is no word boundary, and \bnonce silently missed every one.
    // A pure verification helper is not the place for a nonce — recovering a
    // signer is its whole job and replay protection belongs to its caller. This
    // exempts ECDSA.tryRecover, SignatureChecker and the SignerXyz validators,
    // which were the last five false positives on openzeppelin-contracts.
    const isVerifyHelper =
      /\b(?:view|pure)\b/.test(header) ||
      /^(?:_?try)?(?:recover|isValidSignature|_rawSignatureValidation|_isValidSignature)/i.test(name) ||
      /\blibrary\s+\w+/.test(src);

    if (!isVerifyHelper && /ecrecover\s*\(|ECDSA\.(?:recover|tryRecover)/.test(body) && !/nonce/i.test(body)) {
      const hasDeadline = /deadline|expiry|validUntil|expires?/i.test(body);
      const hasDomain   = /_domainSeparator|DOMAIN_SEPARATOR|_hashTypedData|block\.chainid/i.test(body + src);

      findings.push({
        id:         'SOL-SIG-002',
        severity:   'HIGH',
        confidence: 'MEDIUM',
        title:      `Signature verified in ${name}() without a nonce`,
        detail:     `\`${name}()\` recovers a signer but the signed payload has no nonce, so the same signature stays valid forever and can be submitted repeatedly. ${hasDeadline ? 'A deadline is present, which bounds the window but does not stop replay inside it.' : 'There is also no deadline, so the window is unbounded.'}${hasDomain ? '' : ' No EIP-712 domain separator or chain id was found either — confirm one comes from a base contract, or the signature is replayable across chains and deployments.'}`,
        location:   `${path} → ${name}()`,
        fix:        'Bind every signature to a per-signer nonce and mark it used before acting on it. Cover chain id and verifying contract via an EIP-712 domain separator.',
        refs:       ['SWC-121', 'https://swcregistry.io/docs/SWC-121/'],
      });
    }

    // Unprotected initializer.
    //
    // This has to be function-level and has to accept every idiom, not just
    // OpenZeppelin's. UniswapV2Pair.initialize() is guarded by
    // `require(msg.sender == factory)` and is not upgradeable at all; a
    // file-level check for the `initializer` modifier reported it as a CRITICAL
    // takeover. A caller-identity check is as valid a guard as a modifier.
    if (/^initiali[sz]e\w*$|^__?[Ii]nit\w*$/.test(name) && /\b(?:external|public)\b/.test(header)) {
      const guarded =
        /\binitiali[sz]er\b|\breinitializer\b/.test(header) ||           // OZ modifier
        /\bonly\w+/.test(header) ||                                       // onlyOwner/onlyRole/...
        /require\s*\(\s*msg\.sender\s*==/.test(body) ||                   // factory / admin check
        /if\s*\(\s*msg\.sender\s*!=/.test(body) ||                        // custom-error form
        /_?initiali[sz]ed\b/.test(body) ||                                // manual flag
        /_checkRole|_checkOwner|_disableInitializers/.test(body) ||
        // An "already initialized" guard on state: UniswapV3Pool uses
        // `require(slot0.sqrtPriceX96 == 0, 'AI')`, and old OZ proxies use
        // `require(_implementation() == address(0))`. Both are real guards.
        /require\s*\(\s*[\w.()[\]]+\s*==\s*(?:0|address\s*\(\s*0\s*\))/.test(body) ||
        /if\s*\(\s*[\w.()[\]]+\s*!=\s*(?:0|address\s*\(\s*0\s*\))\s*\)\s*revert/.test(body);

      if (!guarded) {
        findings.push({
          id:         'SOL-PROXY-001',
          severity:   'CRITICAL',
          confidence: 'MEDIUM',
          title:      `Unprotected initializer ${name}()`,
          detail:     `\`${name}()\` is externally callable and no guard was found — no \`initializer\` modifier, no access-control modifier, no \`msg.sender\` check and no initialized flag. Anyone can call it, and call it again after legitimate setup, taking whatever ownership or configuration it assigns.`,
          location:   `${path} → ${name}()`,
          fix:        'Guard it: OpenZeppelin\'s `initializer` modifier for upgradeable contracts, or `require(msg.sender == factory)` for factory-deployed ones. For upgradeable implementations also call `_disableInitializers()` in the constructor so the logic contract cannot be initialized directly.',
          refs:       ['SWC-118', 'https://proxies.yacademy.dev/'],
        });
      }
    }

    // Privileged setter with no zero-address check.
    if (PRIVILEGED_SETTER.test(header) && !/address\s*\(\s*0\s*\)|!=\s*address\(0\)|ZeroAddress|NoZero/.test(body)) {
      findings.push({
        id:         'SOL-INPUT-001',
        severity:   'MEDIUM',
        confidence: 'MEDIUM',
        title:      `No zero-address check in ${name}()`,
        detail:     `\`${name}()\` assigns a privileged address without rejecting \`address(0)\`. Setting it to zero is usually irreversible: it can disable withdrawals, burn fees, or leave the contract with no owner.`,
        location:   `${path} → ${name}()`,
        fix:        'Revert on `address(0)`. For ownership specifically, prefer a two-step handover (`Ownable2Step`) so a mistyped address cannot orphan the contract.',
        refs:       ['https://github.com/transmissions11/solcurity'],
      });
    }
  }

  return findings;
}

export function checkSolidity(file: RepoFile): Finding[] {
  if (langOf(file.path) !== 'solidity') return [];

  // Interfaces and pure-abstract declarations have no implementation to get
  // wrong, and firing pragma/oracle rules on them is noise.
  const src = stripComments(file.content);
  if (!/\b(?:contract|library)\s+\w+/.test(src)) return [];

  return [
    ...fileRules(file.path, src),
    ...uncheckedLowLevelCall(file.path, src),
    ...functionRules(file.path, src),
  ];
}
