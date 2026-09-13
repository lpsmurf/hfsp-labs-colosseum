// EVM plumbing for the Celo rail: providers, the operator wallet, and tagging.
import { ethers } from "ethers";
import { toDataSuffix } from "@celo/attribution-tags";
import { celoEnv } from "../celoConfig.js";

export const CELO_CHAIN_ID = 42220;
export const BASE_CHAIN_ID = 8453;

export const TOKENS = {
  celo: {
    USDT: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    USDC: "0xcEBA9300f2b948710d2653dD7B07f33A8B32118C",
    USAT: "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771",
  },
  base: { USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
} as const;

export type CeloAsset = keyof typeof TOKENS.celo;

const ERC20 = ["function balanceOf(address) view returns (uint256)"];

let cached: { celo: ethers.Wallet; base: ethers.Wallet } | undefined;

export function wallets() {
  if (!cached) {
    const celo = new ethers.JsonRpcProvider(celoEnv.CELO_RPC_URL, CELO_CHAIN_ID, { staticNetwork: true });
    const base = new ethers.JsonRpcProvider(celoEnv.BASE_RPC_URL, BASE_CHAIN_ID, { staticNetwork: true });
    cached = {
      celo: new ethers.Wallet(celoEnv.STORE_EVM_PRIVATE_KEY, celo),
      base: new ethers.Wallet(celoEnv.STORE_EVM_PRIVATE_KEY, base),
    };
  }
  return cached;
}

export const operatorAddress = () => wallets().celo.address;

/**
 * Append our ERC-8021 attribution suffix to calldata.
 *
 * Solidity decodes only the bytes its signature needs, so a trailing suffix is
 * ignored by the called contract and read by the leaderboard indexer.
 */
export function tagged(data: string | undefined): string {
  const suffix = toDataSuffix(celoEnv.ATTRIBUTION_TAG);
  return (data && data !== "0x" ? data : "0x") + suffix.slice(2);
}

export async function baseUsdcBalance(): Promise<bigint> {
  const { base } = wallets();
  return new ethers.Contract(TOKENS.base.USDC, ERC20, base).balanceOf(base.address);
}
