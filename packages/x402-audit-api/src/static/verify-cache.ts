import type { RepoFile } from '../github.js';
import type { Finding } from '../report.js';
import { langOf, splitFunctions, stripComments } from '../lang.js';

// Verification-cache correctness rules.
//
// The bug class: a program memoizes the result of an expensive cryptographic
// verification, but the cache key does not collision-resistantly bind the whole
// object that was verified. An attacker gets a genuine proof cached under some
// key, then constructs a different object that maps to the same key. The lookup
// hits, full verification is skipped, and forged data is accepted as valid —
// without breaking a single cryptographic primitive and without touching a key
// or a multisig.
//
// This is the shape reported in the September 2026 Liquid Network / Elements
// incident, where a range-proof verification cache was reportedly primed with 68
// small transactions and then collided against to mint unbacked value. That
// account is provisional: no CVE or official post-mortem had been published, so
// these rules target the general class rather than one reconstructed bug.
//
// The class is not new and not specific to sidechains. It is the same mistake as
// a Solidity replay-guard keyed on a message hash that omits the signer, and the
// same mistake as SOL-HASH-001 (abi.encodePacked collisions): an identifier that
// authorizes something without uniquely determining it. CWE-345 / CWE-354.
//
// Scope note: these rules read one file at a time. A cache whose key derivation
// lives in another translation unit will not be resolved. Everything here is a
// lead for a human plus a differential test, not a proof.

const REF_SPEC   = 'x402-audit/references/verification-cache.md';
const REF_CWE345 = 'CWE-345';
const REF_CWE354 = 'CWE-354';

// Identifiers that suggest a store of "we already verified this" state.
const VERIFY_CACHE_ID =
  /\b\w*(?:verif|valid|proof|sig|script|witness|attest)\w*[_.]?(?:cache|cached|seen|ok|passed|result|checked|flags?)\w*\b|\b\w*(?:cache|memo|seen|checked)\w*[_.]?(?:verif|valid|proof|sig|witness)\w*\b/i;

// A hashing call — the thing a cache key should be derived from.
const HASHING =
  /\b(?:sha256|sha3|sha512|keccak256|blake2|blake3|poseidon|hash(?:_all|_full|_of)?|digest|GetHash|SerializeHash|HashWriter|CHashWriter)\b/;

interface CacheRule {
  id:         string;
  severity:   Finding['severity'];
  confidence: NonNullable<Finding['confidence']>;
  title:      string;
  detail:     string;
  fix:        string;
  refs:       string[];
}

const SHORT_CIRCUIT: CacheRule = {
  id:         'VCACHE-001',
  severity:   'CRITICAL',
  confidence: 'MEDIUM',
  title:      'Verification skipped on a cache hit',
  detail:     'A cache lookup returns success directly, so a hit bypasses cryptographic verification entirely. Everything then rests on the cache key being collision-resistant over the complete verified object. If an attacker can make two different objects share a key — by priming the cache with a valid one and then submitting a forged one — the forged object is accepted as verified.',
  fix:        'Derive the cache key from a collision-resistant hash of the full serialized object, including every field that affects validity (commitments, amounts, scripts, asset tags, the proof itself). Then add a differential test: run the corpus with caching on and off and fail the build on any object accepted only with the cache enabled. An accept that depends on the cache is always a bug.',
  refs:       [REF_CWE354, REF_CWE345, REF_SPEC],
};

const PARTIAL_KEY: CacheRule = {
  id:         'VCACHE-002',
  severity:   'HIGH',
  confidence: 'LOW',
  title:      'Verification cache keyed on an identifier, not a hash of the verified object',
  detail:     'A verification result is stored under a bare identifier — a txid, index, height or struct field — rather than a hash of the object that was verified. Identifiers are chosen by whoever builds the transaction and generally do not bind the parts that determine validity, so two semantically different objects can share one key.',
  fix:        'Key the cache on a hash covering the entire object under verification. Where an identifier must be part of the key, concatenate it into a length-prefixed serialization before hashing rather than using it alone.',
  refs:       [REF_CWE345, REF_SPEC],
};

const NO_INVALIDATION: CacheRule = {
  id:         'VCACHE-003',
  severity:   'MEDIUM',
  confidence: 'LOW',
  title:      'Verification cache with no eviction or invalidation path',
  detail:     'Entries are inserted but nothing clears, expires or bounds the cache. A poisoned or stale entry persists indefinitely, and an attacker can prime entries cheaply over a long window — the reported Liquid priming ran roughly 14 hours — with no natural point at which the bad entry ages out.',
  fix:        'Bound the cache by size and lifetime, and flush it on any event that changes validity rules: a consensus parameter change, a fork activation, or a node upgrade. Re-verify rather than trusting an entry across such a boundary.',
  refs:       [REF_SPEC],
};

const REPLAY_KEY: CacheRule = {
  id:         'VCACHE-004',
  severity:   'HIGH',
  confidence: 'MEDIUM',
  title:      'Replay guard keyed on a hash that may not bind its full context',
  detail:     'A single-keyed used/seen/nullifier map marks a payload as consumed. If the key is only the message hash, the same payload can be replayed in any context the hash does not cover — a different signer, recipient, chain or deployment — because each context is not a distinct key.',
  fix:        'Include every distinguishing element in the key or the signed payload: signer, verifying contract, chain id, and a per-signer nonce. In Solidity prefer a nested mapping (`used[signer][hash]`) or an EIP-712 digest that already commits to the domain.',
  refs:       ['SWC-121', REF_CWE345, REF_SPEC],
};

// Was this identifier assigned from a hashing expression anywhere in the file?
// Covers `let k = sha256(..)`, `auto k = SerializeHash(..)`, `k = keccak256(..)`.
function assignedFromHash(src: string, name: string): boolean {
  if (/[.[\]()]/.test(name)) return false; // not a bare local
  const re = new RegExp(
    String.raw`\b${name}\s*(?::[^=;\n]{0,40})?=\s*[^;\n]{0,120}`,
    'g',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (HASHING.test(m[0])) return true;
  }
  return false;
}

function push(findings: Finding[], rule: CacheRule, location: string, extra?: string): void {
  findings.push({
    id:         rule.id,
    severity:   rule.severity,
    confidence: rule.confidence,
    title:      rule.title,
    detail:     extra ? `${extra} ${rule.detail}` : rule.detail,
    location,
    fix:        rule.fix,
    refs:       rule.refs,
  });
}

// A cache lookup whose hit path returns success without verifying. Covers the
// Rust (`return Ok(())`), C++ (`return true`) and JS/Solidity shapes.
//
// The character class must be `[^{}]`, not `[^)\n{]`: the condition normally
// contains a call — `cache.count(out.txid)` — and the block brace sits on the
// next line, so excluding `)` and newlines silently missed every C++ instance.
// Requiring the opening brace immediately before the return keeps it tight.
const HIT_RETURNS_OK = new RegExp(
  String.raw`if\s*\(?[^{}]{0,160}?` +
  String.raw`(?:cache|cached|seen|verified|checked|valid)\w*` +
  String.raw`[^{}]{0,160}?\)?\s*\{\s*` +
  String.raw`(?:return\s+(?:true|Ok\s*\(\s*(?:\(\s*\)|true)\s*\)|SCRIPT_ERR_OK)\s*;?|return\s*;)`,
  'i',
);

// Insertion into a verification cache, capturing the key expression.
const CACHE_INSERT = new RegExp(
  String.raw`(\w*(?:cache|cached|seen|verified|checked)\w*)\s*` +
  String.raw`(?:\.\s*(?:insert|set|put|add|emplace|push)\s*\(|\[)\s*` +
  String.raw`&?\s*([\w.:()\[\]]{1,60}?)\s*(?:,|\]|\))`,
  'gi',
);

// Key expressions that do not bind a whole object: a field access or bare name
// whose tail reads as an identifier rather than a digest.
//
// Deliberately excludes `key`, `hash` and `digest`: those name the output of a
// correct derivation at least as often as a weak one, and including them made
// the rule fire on a properly built `sha256(serialize_full(out))` key.
const WEAK_KEY_TAIL = /(?:^|\.)(?:txid|tx_id|txhash|id|idx|index|height|pos|num|number|slot|outpoint|vout)$/i;

export function checkVerifyCache(file: RepoFile): Finding[] {
  const lang = langOf(file.path);
  if (!['solidity', 'rust', 'cpp', 'js'].includes(lang)) return [];

  const src = stripComments(file.content);
  const findings: Finding[] = [];

  // Gate the whole engine on the file plausibly containing a verification cache.
  // Without this, any ordinary memoization in a frontend would be reported as a
  // consensus defect.
  const looksLikeVerifyCache =
    VERIFY_CACHE_ID.test(src) &&
    /\b(?:verify|verif\w+|validate|check(?:Sig|Proof|Script|Witness)\w*|rangeproof|range_proof|VerifyProof|CheckProof)\b/i.test(src);

  if (looksLikeVerifyCache) {
    // Rule 1 — the exploited shape: hit short-circuits verification.
    for (const fn of splitFunctions(src, lang === 'rust' ? 'fn' : 'function')) {
      if (HIT_RETURNS_OK.test(fn.body)) {
        push(findings, SHORT_CIRCUIT, `${file.path} → ${fn.name}()`,
          `\`${fn.name}()\` returns success on a cache hit.`);
      }
    }
    // C++ has no uniform function keyword to split on, so fall back to the file.
    if (findings.length === 0 && HIT_RETURNS_OK.test(src)) {
      push(findings, SHORT_CIRCUIT, file.path);
    }

    // Rule 2 — key is an identifier rather than a digest.
    let m: RegExpExecArray | null;
    CACHE_INSERT.lastIndex = 0;
    const reported = new Set<string>();
    while ((m = CACHE_INSERT.exec(src)) !== null) {
      const [, store, key] = m;
      if (HASHING.test(key)) continue;          // key is itself a hash — fine
      if (!WEAK_KEY_TAIL.test(key)) continue;   // not obviously a bare id
      // A local whose value came from a hashing call is a correct key even
      // though the insert site only shows the variable name.
      if (assignedFromHash(src, key)) continue;
      if (reported.has(store)) continue;
      reported.add(store);
      push(findings, PARTIAL_KEY, file.path,
        `\`${store}\` is keyed on \`${key}\`, with no hashing call in the key expression.`);
    }
    CACHE_INSERT.lastIndex = 0;

    // Rule 3 — insertion with no eviction anywhere in the file.
    const inserts = /\.\s*(?:insert|emplace|set|put|add)\s*\(/.test(src);
    const evicts  = /\.\s*(?:clear|erase|remove|delete|invalidate|evict|reset|prune|flush)\s*\(|max_size|capacity|ttl|expir/i.test(src);
    if (inserts && !evicts) {
      push(findings, NO_INVALIDATION, file.path);
    }
  }

  // Rule 4 — Solidity replay guard keyed only on a digest. Independent of the
  // verification-cache gate above: this shape shows up in ordinary contracts.
  if (lang === 'solidity') {
    const singleKeyed = /mapping\s*\(\s*bytes32\s*=>\s*bool\s*\)\s*(?:public|private|internal)?\s*(\w*(?:used|seen|executed|processed|consumed|nullifier)\w*)/i.exec(src);
    const nested      = /mapping\s*\(\s*address\s*=>\s*mapping\s*\(\s*bytes32\s*=>\s*bool/i.test(src);
    const recovers    = /ecrecover\s*\(|ECDSA\.(?:recover|tryRecover)/.test(src);
    const hasDomain   = /_domainSeparator|DOMAIN_SEPARATOR|_hashTypedData|block\.chainid/i.test(src);

    if (singleKeyed && recovers && !nested && !hasDomain) {
      push(findings, REPLAY_KEY, file.path,
        `\`${singleKeyed[1]}\` is a single-keyed bytes32 map and no EIP-712 domain separator or chain id was found in this file.`);
    }
  }

  return findings;
}
