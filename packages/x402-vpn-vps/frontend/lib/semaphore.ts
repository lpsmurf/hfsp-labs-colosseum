"use client";
import { Identity } from "@semaphore-protocol/identity";
import { generateProof, type SemaphoreProof } from "@semaphore-protocol/proof";
import { Group } from "@semaphore-protocol/group";

const STORAGE_KEY = "x402_semaphore_identity";

export function getOrCreateIdentity(): Identity {
  if (typeof window === "undefined") throw new Error("Client only");
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return new Identity(stored);
  const identity = new Identity();
  localStorage.setItem(STORAGE_KEY, identity.toString());
  return identity;
}

export function getIdentityCommitment(): bigint {
  return getOrCreateIdentity().commitment;
}

export async function generateClaimProof(params: {
  identity:    Identity;
  groupId:     bigint;
  merkleRoot:  string;
  signal:      string;
  externalNullifier: bigint;
}): Promise<SemaphoreProof> {
  const { identity, merkleRoot, signal, externalNullifier } = params;

  // Reconstruct group from on-chain root for local proof generation
  const group = new Group([identity.commitment]);

  return generateProof(identity, group, signal, externalNullifier);
}

export { type SemaphoreProof, type Identity };
