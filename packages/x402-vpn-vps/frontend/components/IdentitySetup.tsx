"use client";
import { useEffect, useState } from "react";
import { getOrCreateIdentity, getIdentityCommitment } from "../lib/semaphore";

interface Props {
  onReady: (commitment: bigint) => void;
}

export function IdentitySetup({ onReady }: Props) {
  const [commitment, setCommitment] = useState<bigint | null>(null);

  useEffect(() => {
    const id = getOrCreateIdentity();
    const c  = id.commitment;
    setCommitment(c);
    onReady(c);
  }, [onReady]);

  if (!commitment) {
    return <p className="text-sm text-gray-400">Generating anonymous identity…</p>;
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <p className="text-xs text-gray-400 mb-1">Your anonymous identity commitment</p>
      <p className="font-mono text-xs text-green-400 break-all">
        {commitment.toString().slice(0, 20)}…
      </p>
      <p className="text-xs text-gray-500 mt-2">
        Stored locally only. Never transmitted. Links your payment to your claim without revealing your wallet.
      </p>
    </div>
  );
}
