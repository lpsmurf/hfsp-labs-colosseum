"use client";
import { useState } from "react";
import { getOrCreateIdentity, generateClaimProof, type SemaphoreProof } from "../lib/semaphore";

interface Props {
  groupId:    string;
  merkleRoot: string;
  signal:     "vpn-claim" | "vps-claim";
  onProof:    (proof: SemaphoreProof, nullifier: string) => void;
}

export function ProofGenerator({ groupId, merkleRoot, signal, onProof }: Props) {
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const identity = getOrCreateIdentity();
      const proof = await generateClaimProof({
        identity,
        groupId:           BigInt(groupId),
        merkleRoot,
        signal,
        externalNullifier: BigInt(groupId),
      });
      const nullifier = proof.nullifier.toString();
      setDone(true);
      onProof(proof, nullifier);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Proof generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-300">
        Generate a zero-knowledge proof that you paid — without revealing your wallet.
      </p>
      {done ? (
        <p className="text-sm font-medium text-green-400">✓ ZK proof generated</p>
      ) : (
        <button
          onClick={generate}
          disabled={generating}
          className="w-full rounded-lg border border-indigo-500 px-6 py-3 text-sm font-semibold text-indigo-300 transition hover:bg-indigo-950 disabled:opacity-50"
        >
          {generating ? "Generating proof (WASM)…" : "Generate ZK Proof"}
        </button>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
