import type { RepoFile } from '../github.js';
import type { Finding } from '../report.js';
import { langOf, splitFunctions, stripComments } from '../lang.js';

// Solana / Anchor rule set.
//
// shanzson/Smart-Contract-Auditor-Tools-and-Techniques is entirely EVM and
// contributed nothing here, so these rules come from the canonical Solana
// sources instead: Neodyme's sealevel-attacks, the Anchor account-constraint
// docs, and the account-confusion classes behind the Wormhole and Cashio
// incidents.
//
// The through-line for almost every Solana bug is the same: accounts arrive as
// caller-supplied pointers, and the program owns every check on who they are
// and who owns them. Most rules below are a missing check of that kind.

interface RsRule {
  id:         string;
  re:         RegExp;
  severity:   Finding['severity'];
  confidence: NonNullable<Finding['confidence']>;
  title:      string;
  detail:     string;
  fix:        string;
  refs:       string[];
  requires?:  RegExp;
  unless?:    RegExp;
}

const SEALEVEL = 'https://github.com/coral-xyz/sealevel-attacks';

const FILE_RULES: RsRule[] = [
  {
    id:         'SOLANA-SIGNER-001',
    // Raw account iteration with no is_signer assertion anywhere in the file.
    re:         /next_account_info\s*\(/,
    unless:     /\.is_signer|Signer<'/,
    severity:   'CRITICAL',
    confidence: 'MEDIUM',
    title:      'Accounts read without any signer check',
    detail:     'The program walks the account list with `next_account_info` but never asserts `is_signer` and never uses Anchor\'s `Signer` type. Accounts are caller-supplied, so nothing stops an attacker passing someone else\'s account and acting as them.',
    fix:        'Assert `account.is_signer` on every account whose authority is being relied on, or type the field as `Signer<\'info>` and let Anchor enforce it.',
    refs:       [`${SEALEVEL}/tree/master/programs/0-signer-authorization`, 'CWE-862'],
  },
  {
    id:         'SOLANA-OWNER-001',
    // Manual deserialization straight out of account data, with no owner check.
    re:         /try_from_slice\s*\(\s*&?\*?\s*[\w.]+\.(?:data|try_borrow_data)/,
    unless:     /\.owner\s*==|owner\s*!=|check_owner|assert_owned_by/,
    severity:   'CRITICAL',
    confidence: 'MEDIUM',
    title:      'Account deserialized without verifying its owner program',
    detail:     'Account data is deserialized without checking `account.owner` against the expected program id. An attacker can hand over a look-alike account they created and fully control, and the program will trust its contents — the Cashio pattern.',
    fix:        'Check `account.owner == program_id` before deserializing, or use Anchor\'s `Account<\'info, T>`, which verifies both the owner and the 8-byte discriminator.',
    refs:       [`${SEALEVEL}/tree/master/programs/2-owner-checks`, 'CWE-345'],
  },
  {
    id:         'SOLANA-ACCOUNT-001',
    re:         /\b(?:UncheckedAccount|AccountInfo)\s*<\s*'info\s*>/,
    requires:   /#\[derive\(Accounts\)\]/,
    severity:   'HIGH',
    confidence: 'LOW',
    title:      'Unvalidated account type in an Accounts struct',
    detail:     '`AccountInfo` and `UncheckedAccount` opt out of every check Anchor would otherwise apply — no owner check, no discriminator check, no type check. Whatever the caller passes is accepted.',
    fix:        'Use `Account<\'info, T>`, `Program<\'info, T>` or `Signer<\'info>` wherever possible. Where a raw account is genuinely required, constrain it with `#[account(address = ...)]` or an explicit in-body check, and document why.',
    refs:       [`${SEALEVEL}/tree/master/programs/2-owner-checks`],
  },
  {
    id:         'SOLANA-MATH-001',
    // Cargo.toml switching overflow checks off, or a release profile without them.
    re:         /overflow-checks\s*=\s*false/,
    severity:   'HIGH',
    confidence: 'HIGH',
    title:      'Integer overflow checks disabled in release builds',
    detail:     'With `overflow-checks = false`, arithmetic wraps silently in the deployed binary. A balance or share calculation that wraps past zero is a direct path to minting value from nothing, and it will not reproduce in a debug-mode test.',
    fix:        'Set `overflow-checks = true` under `[profile.release]` in Cargo.toml, and use `checked_*`/`saturating_*` arithmetic on every balance and supply calculation regardless.',
    refs:       ['https://book.anchor-lang.com/', 'CWE-190'],
  },
  {
    id:         'SOLANA-SYSVAR-001',
    re:         /(?:Clock|Rent|EpochSchedule)::from_account_info\s*\(/,
    severity:   'MEDIUM',
    confidence: 'HIGH',
    title:      'Sysvar read from a caller-supplied account',
    detail:     'Reading a sysvar through `from_account_info` trusts whichever account the caller passed at that position. A spoofed clock lets an attacker fake the passage of time and defeat any lock, vesting schedule or auction deadline.',
    fix:        'Use `Clock::get()` / `Rent::get()`, which read the runtime sysvar directly and cannot be substituted.',
    refs:       [`${SEALEVEL}/tree/master/programs/7-sysvar-address-checking`],
  },
  {
    id:         'SOLANA-PDA-001',
    re:         /Pubkey::create_program_address\s*\(/,
    severity:   'MEDIUM',
    confidence: 'MEDIUM',
    title:      'PDA derived with create_program_address',
    detail:     '`create_program_address` accepts whatever bump it is given, so several bumps can yield valid addresses for the same seeds. If the bump comes from the caller, they can derive an alternate PDA the program treats as canonical.',
    fix:        'Use `find_program_address` to get the canonical bump, or in Anchor store the bump and constrain with `seeds = [...], bump = state.bump`.',
    refs:       [`${SEALEVEL}/tree/master/programs/7-bump-seed-canonicalization`],
  },
  {
    id:         'SOLANA-CPI-001',
    re:         /\binvoke(?:_signed)?\s*\(/,
    unless:     /Program\s*<\s*'info|program_id\s*==|::ID\s*==|\.key\s*\(\s*\)\s*==\s*\w*(?:token|system)/i,
    severity:   'HIGH',
    confidence: 'LOW',
    title:      'CPI without an apparent program id check',
    detail:     'A cross-program invocation is made without any visible verification of the callee\'s program id. If the target program account is caller-supplied, an attacker substitutes their own program and the CPI runs their code with this program\'s signer seeds.',
    fix:        'Type the callee as `Program<\'info, Token>` (or equivalent), or compare the account key against the expected hardcoded program id before invoking.',
    refs:       [`${SEALEVEL}/tree/master/programs/5-arbitrary-cpi`],
  },
  {
    id:         'SOLANA-CLOSE-001',
    // Manual lamport drain without wiping the account so it cannot be revived.
    re:         /\*\*\s*[\w.]+\.(?:try_borrow_mut_lamports|lamports\.borrow_mut)\s*\(\s*\)\s*\??\s*=\s*0/,
    unless:     /CLOSED_ACCOUNT_DISCRIMINATOR|discriminator.*\[0xff|data\.fill\(|close\s*=/,
    severity:   'HIGH',
    confidence: 'MEDIUM',
    title:      'Account closed by draining lamports without invalidating its data',
    detail:     'Zeroing lamports does not erase the account within the transaction. An attacker can refund the rent in the same transaction to keep it alive, leaving a closed account whose stale data the program still accepts — the account revival attack.',
    fix:        'Use Anchor\'s `#[account(close = destination)]`, which writes a closed-account discriminator. Doing it manually means zeroing the data and writing a sentinel discriminator the program rejects on load.',
    refs:       [`${SEALEVEL}/tree/master/programs/9-closing-accounts`],
  },
  {
    id:         'SOLANA-TOKEN-001',
    re:         /Account\s*<\s*'info\s*,\s*TokenAccount\s*>/,
    unless:     /token::(?:mint|authority)|associated_token::|constraint\s*=[^,\]]*(?:mint|owner|authority)/,
    severity:   'HIGH',
    confidence: 'MEDIUM',
    title:      'TokenAccount without mint or authority constraints',
    detail:     'A `TokenAccount` field with no `token::mint` or `token::authority` constraint only proves the account is some SPL token account. The caller can pass one for a worthless mint they control, or one belonging to someone else, and the program will transfer against it.',
    fix:        'Constrain every token account: `#[account(mut, token::mint = expected_mint, token::authority = expected_owner)]`.',
    refs:       [`${SEALEVEL}/tree/master/programs/4-initialization`],
  },
  {
    id:         'SOLANA-REMAINING-001',
    re:         /remaining_accounts/,
    unless:     /remaining_accounts\.len\s*\(\s*\)\s*[=!<>]|require!?\s*\([^)]*remaining_accounts/,
    severity:   'MEDIUM',
    confidence: 'LOW',
    title:      'remaining_accounts used without validation',
    detail:     '`remaining_accounts` bypasses the Accounts struct entirely — no type, owner or signer checks are applied to anything in it. Its length and the identity of each entry are fully attacker-controlled.',
    fix:        'Validate the length, then check owner, key and signer status on each entry before use, exactly as Anchor would for a declared field.',
    refs:       [`${SEALEVEL}/tree/master/programs/2-owner-checks`],
  },
];

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

// Raw arithmetic on a value that represents money. overflow-checks catches this
// in release builds, but only if it is actually on — and saturating behaviour is
// usually wrong for balances even when it is.
const MONEY = /\b(?:lamports|amount|balance|supply|total|shares|collateral|debt|reward)\w*/i;

function instructionRules(path: string, src: string): Finding[] {
  const findings: Finding[] = [];

  for (const fn of splitFunctions(src, 'fn')) {
    const { name, body } = fn;

    const raw = new RegExp(`${MONEY.source}\\s*(?:[+\\-*]|[+\\-*]=)\\s*\\w`, 'i').exec(body);
    if (raw && !/checked_(?:add|sub|mul|div)|saturating_|\bu128\b/.test(body)) {
      findings.push({
        id:         'SOLANA-MATH-002',
        severity:   'MEDIUM',
        confidence: 'LOW',
        title:      `Unchecked arithmetic on a balance in ${name}()`,
        detail:     `\`${name}()\` does raw arithmetic on what looks like a balance or supply value without \`checked_*\`. If release-mode overflow checks are ever disabled, this wraps silently; if they are on, it panics and becomes a denial of service on the instruction.`,
        location:   `${path} → ${name}()`,
        fix:        'Use `checked_add`/`checked_sub`/`checked_mul` and return a program error on `None`. Widen to `u128` for intermediate products in share maths.',
        refs:       ['CWE-190'],
      });
    }
  }

  return findings;
}

export function checkSolana(file: RepoFile): Finding[] {
  const lang = langOf(file.path);

  // Cargo.toml carries the overflow-checks setting, which is one of the highest
  // value checks in the whole set, so config files are in scope here too.
  if (lang === 'config' && /Cargo\.toml$/.test(file.path)) {
    return fileRules(file.path, file.content).filter(f => f.id === 'SOLANA-MATH-001');
  }

  if (lang !== 'rust') return [];

  const src = stripComments(file.content);
  // Only Solana programs, not arbitrary Rust that happens to be in the repo.
  if (!/solana_program|anchor_lang|#\[program\]|entrypoint!/.test(src)) return [];

  return [...fileRules(file.path, src), ...instructionRules(file.path, src)];
}
