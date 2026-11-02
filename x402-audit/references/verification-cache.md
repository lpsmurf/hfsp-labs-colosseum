# Verification-cache correctness

Reference for the `VCACHE-*` rules in
[`packages/x402-audit-api/src/static/verify-cache.ts`](../../packages/x402-audit-api/src/static/verify-cache.ts).

## The bug class

A program memoizes the result of an expensive cryptographic verification —
a range proof, a signature, a ZK proof, a Merkle path. The cache key does not
collision-resistantly bind the *whole* object that was verified.

An attacker then:

1. Submits objects that are genuinely valid, to get a `verified = true` entry
   cached under some key. (Priming. Cheap, and can run for hours.)
2. Constructs a different object — one that would fail verification — whose
   cache key collides with the primed entry.
3. Submits it. The lookup hits, full verification is skipped, and forged data is
   accepted as consensus-valid.

No cryptographic primitive is broken. No key is stolen. No multisig is
subverted. Every access control in the system works exactly as designed and
signs off on value that was never real, because the validation layer upstream of
it was fooled.

Classification: CWE-354 (improper validation of integrity check value),
CWE-345 (insufficient verification of data authenticity).

## Why it generalizes

This is not a sidechain-specific bug. It is the same mistake as:

- A Solidity replay guard keyed on a message hash that omits the signer, so the
  same payload is replayable in a context the key does not separate. → `VCACHE-004`
- `abi.encodePacked` collisions, where `("a","bc")` and `("ab","c")` hash
  identically and one authorizes the other. → `SOL-HASH-001`
- Any `seen`/`processed`/`nullifier` set whose key is narrower than the thing it
  is supposed to make unique.

One sentence covers all of them: **an identifier that authorizes something
without uniquely determining it.**

Any federated bridge, sidechain, wrapped-asset system, or rollup with a caching
layer in its validation pipeline is a candidate.

## Reference incident (provisional)

The September 2026 Liquid Network / Elements incident is reported to be an
instance: a range-proof verification cache primed with 68 small transactions
(41 sat each) over ~14 hours, then collided against to mint unbacked L-BTC and
peg out ~3,996 BTC in roughly 28 minutes. The 11-of-15 federation multisig and
SideSwap's PAK both reportedly functioned correctly throughout.

**Treat the mechanism as unconfirmed.** At the time of writing Blockstream had
published no CVE and no full technical post-mortem; the cache-key-collision
account comes from third-party forensic write-ups. The rules here target the
general class, and none of them depend on that reconstruction being accurate.

Contributing factor worth noting independently of the specifics: the affected
path was reportedly 2019-era code that had gone 2+ years without a security
re-audit of the cache subsystem, and had been touched by an unrelated patch days
before. Patch age and review depth on consensus-critical caching code is a real
signal regardless of what exactly happened here.

## What the static rules catch

| Rule | Shape | Severity / confidence |
|---|---|---|
| `VCACHE-001` | Cache hit returns success, short-circuiting verification | CRITICAL / MEDIUM |
| `VCACHE-002` | Cache keyed on a bare identifier (txid, index, height) rather than a digest of the object | HIGH / LOW |
| `VCACHE-003` | Insertion with no eviction, TTL or invalidation path | MEDIUM / LOW |
| `VCACHE-004` | Solidity replay guard on a single-keyed `bytes32 => bool` with no EIP-712 domain | HIGH / MEDIUM |

Languages: Solidity, Rust, C++ (Bitcoin Core / Elements forks), TypeScript.
C++ is ingested **only** for these rules — there is no general C++ rule set.

Limits, stated plainly: these read one file at a time with no type resolution and
no cross-translation-unit analysis. A cache whose key derivation lives in another
file will not be resolved. `VCACHE-001` firing is a lead for a human plus a
differential test, not a proof; `VCACHE-002` is LOW confidence by design.

## The check that actually proves it

Static analysis can only point at candidates. The test that settles it is
**differential**:

> Run the verification corpus twice — once with caching enabled, once with full
> re-verification — and diff accept/reject outcomes. **Any object accepted with
> the cache on and rejected with it off is a critical finding.** An accept that
> depends on the cache is always a bug.

This is cheap, needs no knowledge of the specific collision, and would catch the
entire class including variants nobody has thought of. Pair it with a fuzzer over
the cache-key derivation function: mutate the object while holding the key
constant, and any success is a collision.

We do not implement this. It requires building and running the target's
verification pipeline, which is per-project integration work, not something a
repo scanner can do. It is the single highest-value thing to hand a bridge team.

## Correct cache-key derivation

```
key = H(full_canonical_serialization(object))
```

Every field that affects validity must be inside the hash: commitments, amounts,
asset tags, scripts, the proof bytes themselves. Use a length-prefixed
serialization so concatenation cannot be ambiguous. Where an identifier must
participate, hash it *with* the rest rather than using it alone.

Then bound the cache by size and lifetime, and flush it on any event that
changes validity rules — consensus parameter change, fork activation, node
upgrade. Re-verify rather than trusting an entry across such a boundary.

## Out of scope for this platform

The runtime half of the defense — priming-pattern detection, peg-out velocity
and reserve-concentration monitors, out-of-band reserve reconciliation, and
automated circuit breakers — is a monitoring product, not an audit tool. It needs
node access, a chain indexer, and the authority to halt peg-outs. We have none
of those, and a repo scanner cannot provide them.

Worth stating for anyone scoping that work: monitoring without automated response
would not have prevented the reference incident. The drain completed in ~28
minutes. Any design where an alert waits on a human is too slow, and the pause
authority has to sit outside the transaction-processing path so a compromised
node can neither trigger nor block it.
