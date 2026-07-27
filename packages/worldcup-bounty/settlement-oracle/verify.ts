/**
 * Settlement-oracle reference verifier (off-chain).
 *
 * Mirrors exactly what the Anchor program does on-chain (`solana_program::keccak`
 * == Ethereum keccak256), so we can unit-test the proof math the moment TxODDS
 * gives us a sample signed score + proof. Swap `buildLeaf` to TxODDS's confirmed
 * encoding; the fold logic stays.
 *
 * Run:  npx tsx settlement-oracle/verify.ts   (self-test with a built tree)
 */
import sha3 from "js-sha3";
const { keccak256 } = sha3;

export type Outcome = 0 | 1 | 2; // 0 home, 1 draw, 2 away

export interface Score {
  fixtureId: bigint;
  outcome: Outcome;
  scoreHome: number;
  scoreAway: number;
}

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const keccak = (b: Uint8Array): Uint8Array => new Uint8Array(keccak256.arrayBuffer(b));

/** Borsh-style little-endian leaf preimage, then keccak. Must match lib.rs + TxODDS. */
export function buildLeaf(s: Score): Uint8Array {
  const buf = Buffer.alloc(8 + 1 + 2 + 2);
  let o = 0;
  buf.writeBigUInt64LE(s.fixtureId, o); o += 8;
  buf.writeUInt8(s.outcome, o); o += 1;
  buf.writeUInt16LE(s.scoreHome, o); o += 2;
  buf.writeUInt16LE(s.scoreAway, o); o += 2;
  return keccak(buf);
}

/** Sorted-pair keccak (OZ-style): parent = keccak(min(a,b) ‖ max(a,b)). */
function hashPair(a: Uint8Array, b: Uint8Array): Uint8Array {
  const [lo, hi] = compare(a, b) <= 0 ? [a, b] : [b, a];
  const cat = new Uint8Array(64);
  cat.set(lo, 0);
  cat.set(hi, 32);
  return keccak(cat);
}

function compare(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < 32; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

/** Fold a Merkle proof from a leaf up to a root. */
export function processProof(leaf: Uint8Array, proof: Uint8Array[]): Uint8Array {
  return proof.reduce((acc, sibling) => hashPair(acc, sibling), leaf);
}

/** The exact check the on-chain `resolve` does. */
export function verify(score: Score, proof: Uint8Array[], root: Uint8Array): boolean {
  const computed = processProof(buildLeaf(score), proof);
  return compare(computed, root) === 0;
}

// ── Build a tree from a leaf set (for our own tests / committing a root) ────────
export function buildTree(leaves: Uint8Array[]): { root: Uint8Array; proofOf: (i: number) => Uint8Array[] } {
  if (leaves.length === 0) throw new Error("empty leaf set");
  const layers: Uint8Array[][] = [leaves.slice()];
  while (layers[layers.length - 1]!.length > 1) {
    const prev = layers[layers.length - 1]!;
    const next: Uint8Array[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(i + 1 < prev.length ? hashPair(prev[i]!, prev[i + 1]!) : prev[i]!);
    }
    layers.push(next);
  }
  const root = layers[layers.length - 1]![0]!;
  const proofOf = (index: number): Uint8Array[] => {
    const proof: Uint8Array[] = [];
    let idx = index;
    for (let l = 0; l < layers.length - 1; l++) {
      const layer = layers[l]!;
      const pair = idx ^ 1;
      if (pair < layer.length) proof.push(layer[pair]!);
      idx = Math.floor(idx / 2);
    }
    return proof;
  };
  return { root, proofOf };
}

// ── Self-test ───────────────────────────────────────────────────────────────
function selfTest() {
  const scores: Score[] = [
    { fixtureId: 500101n, outcome: 0, scoreHome: 2, scoreAway: 1 },
    { fixtureId: 500102n, outcome: 2, scoreHome: 0, scoreAway: 3 },
    { fixtureId: 500103n, outcome: 1, scoreHome: 1, scoreAway: 1 },
    { fixtureId: 500104n, outcome: 0, scoreHome: 4, scoreAway: 0 },
    { fixtureId: 500105n, outcome: 2, scoreHome: 1, scoreAway: 2 },
  ];
  const leaves = scores.map(buildLeaf);
  const { root, proofOf } = buildTree(leaves);
  console.log("Settlement-oracle verifier self-test\n");
  console.log("merkle root:", hex(root), "\n");

  let ok = true;
  scores.forEach((s, i) => {
    const proof = proofOf(i);
    const good = verify(s, proof, root);
    ok &&= good;
    console.log(`  fixture ${s.fixtureId}  outcome=${s.outcome}  proof[${proof.length}]  ${good ? "✓ verified" : "✗ FAILED"}`);
  });

  // tamper: wrong outcome must fail
  const tampered = verify({ ...scores[0]!, outcome: 2 }, proofOf(0), root);
  console.log(`\n  tampered (flipped outcome) rejected: ${!tampered ? "✓" : "✗ LEAK"}`);

  // tamper: garbage proof must fail
  const garbage = verify(scores[1]!, [new Uint8Array(32)], root);
  console.log(`  garbage proof rejected:              ${!garbage ? "✓" : "✗ LEAK"}`);

  const pass = ok && !tampered && !garbage;
  console.log(`\n${pass ? "ALL PASS" : "FAILURES PRESENT"}`);
  if (!pass) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) selfTest();
