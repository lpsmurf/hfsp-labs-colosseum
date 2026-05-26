import { useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { PublicKey } from '@solana/web3.js';
import { encryptCredentials, decryptCredentials } from '../crypto/credentialVault';
import {
  buildCredentialVaultMessage,
  deriveKey,
  generateVaultSalt,
} from '../crypto/keyDerivation';
import type { CredentialMap, EncryptedCredentials } from '../crypto/types';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type SignMessage = (message: Uint8Array) => Promise<Uint8Array>;

export interface WalletEncryptedBlob {
  encryptedBlob: string;
  nonce: string;
  salt: string;
}

export type VaultAuthHeaders = Record<string, string> & {
  Authorization: string;
  'X-Wallet-Pubkey': string;
  'X-Wallet-Address': string;
};

interface WalletEncryptionWallet {
  address: string | null;
  connected: boolean;
  name: string | null;
}

type WalletEncryptedBlobInput = WalletEncryptedBlob | string;

export function buildVaultApiAuthMessage(publicKey: string): string {
  return `Clawdrop vault API authentication - v1: ${publicKey.trim()}`;
}

export async function buildVaultAuthHeaders(
  publicKey: PublicKey | null,
  signMessage: SignMessage | undefined
): Promise<VaultAuthHeaders> {
  const walletAddress = publicKey?.toBase58();
  if (!walletAddress) {
    throw new Error('Connect a wallet before authorizing vault access.');
  }

  if (!signMessage) {
    throw new Error('This wallet does not support message signing.');
  }

  const signature = await signMessage(textEncoder.encode(buildVaultApiAuthMessage(walletAddress)));
  const encodedSignature = bytesToBase64(signature);

  return {
    Authorization: `Bearer ${encodedSignature}`,
    'X-Wallet-Pubkey': walletAddress,
    'X-Wallet-Address': walletAddress,
  };
}

export function useWalletEncryption(agentId: string): {
  encrypt: (credentials: CredentialMap) => Promise<WalletEncryptedBlob>;
  decrypt: (encryptedBlob: WalletEncryptedBlobInput) => Promise<CredentialMap>;
  isReady: boolean;
  wallet: WalletEncryptionWallet;
} {
  const walletAdapter = useWallet();
  const { connected, publicKey, signMessage, wallet } = walletAdapter;
  const walletAddress = publicKey?.toBase58() ?? null;
  const normalizedAgentId = agentId.trim();

  const isReady = Boolean(connected && walletAddress && signMessage && normalizedAgentId);

  const encrypt = useCallback(async (credentials: CredentialMap): Promise<WalletEncryptedBlob> => {
    if (!walletAddress || !publicKey || !signMessage) {
      throw new Error('Connect a wallet that supports message signing before encrypting credentials.');
    }

    if (!normalizedAgentId) {
      throw new Error('Agent id is required before encrypting credentials.');
    }

    const signingMessage = buildCredentialVaultMessage(normalizedAgentId, walletAddress);
    const signature = await signMessage(textEncoder.encode(signingMessage));
    const salt = generateVaultSalt();
    const key = await deriveKey(signature, salt, normalizedAgentId);
    const encrypted = await encryptCredentials(credentials, key, salt);

    return {
      encryptedBlob: bytesToBase64(encrypted.ciphertext),
      nonce: bytesToBase64(encrypted.nonce),
      salt: bytesToBase64(encrypted.salt),
    };
  }, [normalizedAgentId, publicKey, signMessage, walletAddress]);

  const decrypt = useCallback(async (encryptedBlob: WalletEncryptedBlobInput): Promise<CredentialMap> => {
    if (!walletAddress || !publicKey || !signMessage) {
      throw new Error('Connect the original wallet before decrypting credentials.');
    }

    if (!normalizedAgentId) {
      throw new Error('Agent id is required before decrypting credentials.');
    }

    const blob = normalizeEncryptedBlob(encryptedBlob);
    const encrypted: EncryptedCredentials = {
      ciphertext: base64ToBytes(blob.encryptedBlob),
      nonce: base64ToBytes(blob.nonce),
      salt: base64ToBytes(blob.salt),
    };
    const signingMessage = buildCredentialVaultMessage(normalizedAgentId, walletAddress);
    const signature = await signMessage(textEncoder.encode(signingMessage));
    const key = await deriveKey(signature, encrypted.salt, normalizedAgentId);

    return decryptCredentials(encrypted, key);
  }, [normalizedAgentId, publicKey, signMessage, walletAddress]);

  return {
    encrypt,
    decrypt,
    isReady,
    wallet: useMemo(
      () => ({
        address: walletAddress,
        connected,
        name: wallet?.adapter.name ?? null,
      }),
      [connected, wallet, walletAddress]
    ),
  };
}

function normalizeEncryptedBlob(value: WalletEncryptedBlobInput): WalletEncryptedBlob {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  const parsed = parseSerializedBlob(trimmed) ?? parseSerializedBlob(textDecoder.decode(base64ToBytes(trimmed)));
  if (!parsed) {
    throw new Error('Encrypted credentials must include encryptedBlob, nonce, and salt.');
  }

  return parsed;
}

function parseSerializedBlob(value: string): WalletEncryptedBlob | null {
  try {
    const parsed = JSON.parse(value) as Partial<WalletEncryptedBlob>;
    if (
      typeof parsed.encryptedBlob === 'string' &&
      typeof parsed.nonce === 'string' &&
      typeof parsed.salt === 'string'
    ) {
      return {
        encryptedBlob: parsed.encryptedBlob,
        nonce: parsed.nonce,
        salt: parsed.salt,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
