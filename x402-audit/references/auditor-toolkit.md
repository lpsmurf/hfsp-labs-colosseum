# Smart-contract auditor toolkit — what we took and what we skipped

Distilled from [shanzson/Smart-Contract-Auditor-Tools-and-Techniques](https://github.com/shanzson/Smart-Contract-Auditor-Tools-and-Techniques),
[paradigmxyz/evmbench](https://github.com/paradigmxyz/evmbench), and the primary
sources both point at.

The shanzson repo is a single 20KB README of curated links — no code, no rules,
EVM/Solidity only, nothing on Solana or any non-EVM chain. Its value is as an
index to primary sources, not as something to integrate.

## Adopted — now in the platform

| Source | What we built |
|---|---|
| [SWC Registry](https://swcregistry.io/) | Rule taxonomy. Every EVM finding cites an SWC and/or CWE id via the new `refs` field. |
| [transmissions11/solcurity](https://github.com/transmissions11/solcurity) | Zero-address setter checks, unlimited-approval check |
| [crytic/not-so-smart-contracts](https://github.com/crytic/not-so-smart-contracts), [DeFiVulnLabs](https://github.com/SunWeb3Sec/DeFiVulnLabs) | Reentrancy ordering, unchecked call returns, unchecked ERC-20 returns |
| [pcaversaccio/reentrancy-attacks](https://github.com/pcaversaccio/reentrancy-attacks) | `SOL-REENTRANCY-001` detail and fix text |
| [awesome-oracle-manipulation](https://github.com/0xcacti/awesome-oracle-manipulation), [samczsun on price oracles](https://samczsun.com/so-you-want-to-use-a-price-oracle/) | `SOL-ORACLE-001` — AMM spot-price pricing |
| [proxies.yacademy.dev](https://proxies.yacademy.dev/) | `SOL-PROXY-001` — unprotected initializer |
| [OZ ERC-4626 inflation attack](https://docs.openzeppelin.com/contracts/5.x/erc4626#inflation-attack) | `SOL-4626-001` |
| [d-xo/weird-erc20](https://github.com/d-xo/weird-erc20) | Missing-return-value ERC-20 handling |

**evmbench is NOT integrated.** Nothing from it runs in the platform. It was read,
not adopted. The `confidence` + `refs` + `needsReview` additions were our own
design decisions, informed by reading `detect.md` but not taken from it. Its
actual reusable pieces — the agent prompt and the benchmark corpus — are both
still untouched; see the evmbench section below for what each would take.

Not from either repo — the Solana rules come from
[coral-xyz/sealevel-attacks](https://github.com/coral-xyz/sealevel-attacks)
(Neodyme) and the Anchor constraint docs, since neither source covers Solana at
all. That gap is the main reason the Solana engine was worth writing ourselves.

## Deferred, with reasons

| Tool | Why not yet |
|---|---|
| **Slither** | Needs compiled source + solc per project. Real value, real integration cost. The right next step if we want depth on EVM. |
| **Aderyn** (Cyfrin) | Rust, fast, lighter than Slither. **Best candidate for the next engine** — closest to drop-in for our model. |
| **Semgrep** + [Decurity/semgrep-smart-contracts](https://github.com/Decurity/semgrep-smart-contracts) | Deferred pending a stronger VPS (see `project_x402_audit_external_engines`). Rule *patterns* were read and partly reimplemented as regex. |
| **Echidna / Halmos / Mythril / Certora** | Fuzzing and formal verification need a build harness and real compute per target. Out of scope for a seconds-long scan. |
| **whatsabi**, **sol2uml**, **abi-guesser** | Useful for manual review of unverified/deployed contracts, not for repo scanning. Keep in the manual toolkit (`reference_audit_toolkit`). |
| Monitoring stack (Forta, Hypernative, Tenderly alerts) | Different product — runtime, not audit. See [verification-cache.md](verification-cache.md). |

## evmbench — the genuinely useful find

[paradigmxyz/evmbench](https://github.com/paradigmxyz/evmbench) is a benchmark
and agent harness for finding contract bugs (Paradigm + OpenAI + osec). Two
things matter to us:

1. **`backend/worker_runner/detect.md`** — the actual agent prompt. Well-built
   and directly applicable to our `ai-feedback.ts`. Notable choices: restrict to
   loss-of-funds only; assume owner/admin/governance are trusted and do not
   report issues requiring their malicious action; severity always `high` because
   nothing else is reported; enforce parseable JSON output.
2. **`frontier-evals`** submodule ([openai/frontier-evals](https://github.com/openai/frontier-evals))
   — the evaluation corpus. This is a **ground-truth benchmark of contracts with
   known bugs**, which is exactly what we lack. We currently measure precision
   against clean code (OpenZeppelin) but have no recall measurement at all.

**Highest-value next step for the platform:** run our engines against the
frontier-evals corpus to get a real recall number. Precision without recall tells
us we are quiet, not that we are useful.

## Current measured behaviour

Precision baseline — all 248 non-test contracts in `openzeppelin-contracts`,
which should be near-clean:

```
248 files → 22 findings
  13  SOL-PRAGMA-001  [LOW/HIGH]      floating pragma on deployable proxies
   3  SOL-INPUT-001   [MEDIUM/MEDIUM] zero-address setters
   2  SOL-DELEGATE-001[HIGH/LOW]      delegatecall in proxies (by design)
   1  SOL-4626-001    [INFO/LOW]      ERC4626 checklist prompt
   1  SOL-HASH-001    [MEDIUM/MEDIUM]
   1  SOL-SIG-001     [HIGH/MEDIUM]
   1  SOL-RAND-001    [HIGH/MEDIUM]
```

Down from 52 after fixing three real false-positive bugs found during this pass:

- `STATIC-SECRET-004` reported 21 CRITICAL "leaked EVM private keys" across OZ —
  all of them ERC-7201 namespaced storage slots. A bare 32-byte hex literal in
  contract source is a slot or typehash, never a key. Now suppressed for contract
  languages.
- `SOL-SIG-002` used `\bnonce`, which cannot match `_useNonce` — no word boundary
  after `_use`. It therefore fired on `ERC20Permit.permit` and all of ERC-3009,
  which are correct. Fixed, and narrowed to trigger on a missing nonce only:
  domain separators usually come from an inherited base and some signed
  operations legitimately have no deadline, neither of which is judgeable from a
  single file.
- `SOL-PRAGMA-001` fired on every library and interface. Libraries float their
  pragma on purpose; now gated on a deployable `contract`.

Recall is verified only against hand-written fixtures (11/11 Solidity, 8/8
Solana/Anchor, 3/3 cache, 0 findings on corrected versions of each). That is not
a substitute for a real benchmark — see frontier-evals above.

## Report discipline (ours, informed by reading evmbench)

Not copied from evmbench — these are our decisions. What `detect.md` actually
prescribes and we have **not** implemented: loss-of-funds-only filtering,
treating privileged roles as trusted, and per-finding `line_start`/`line_end`
(our `Finding.location` is still a plain string, file- or function-level).

- **Confidence on every finding** (`HIGH`/`MEDIUM`/`LOW`) plus a
  `summary.needsReview` count. Pattern matching cannot prove a bug; saying which
  findings we are actually sure about is the difference between a report an
  auditor can triage and one they must re-derive.
- **Standards refs** (`refs: ['SWC-107', 'CWE-252', ...]`) so a finding is
  checkable against prior art.
- **Coverage map** in report meta — files seen per language. A caller needs to
  tell "we found nothing" apart from "we have no rules for this language".
  Clarity and Move files are fetched and counted but **not analysed**; the
  coverage map is what stops a clean report from implying otherwise.

## Known coverage gaps

- **Clarity** (`.clar`) and **Move** — ingested and counted, zero rules. Writing
  weak rules here would be worse than none.
- **C++** — only the `VCACHE-*` rules. Not a general C++ auditor.
- **Cross-file/inheritance analysis** — none. Every rule is file-local, which is
  the ceiling on what regex can do and the reason Aderyn/Slither remain the
  answer for depth.
- **Recall measurement** — none. This is the biggest gap.
