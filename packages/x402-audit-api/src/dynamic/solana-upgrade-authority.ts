import type { Finding } from '../report.js';

/**
 * Flags Solana programs that are upgradeable by a single plain keypair (not immutable, not a
 * multisig). Generalizes the MultiHopper "UPGRADE-AUTH" finding: the fund-custody programs (incl.
 * the Token2022 permanent-delegate program) were all upgradeable by one System-owned wallet, which
 * contradicts a "you don't need to trust the team" security claim.
 *
 * Standalone (takes program IDs, not an HTTP endpoint) so callers can feed it program IDs extracted
 * from a repo's Anchor.toml / declare_id! or provided explicitly. Read-only RPC.
 */

const RPC: Record<string, string> = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  devnet:  'https://api.devnet.solana.com',
};
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

async function rpc<T = any>(url: string, method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
    return (await res.json())?.result ?? null;
  } catch {
    return null;
  }
}

export async function checkProgramUpgradeAuthority(
  programIds: string[],
  cluster: 'mainnet' | 'devnet' = 'mainnet',
): Promise<Finding[]> {
  const url = RPC[cluster];
  const findings: Finding[] = [];

  for (const pid of programIds) {
    const prog = await rpc(url, 'getAccountInfo', [pid, { encoding: 'jsonParsed' }]);
    const info = prog?.value?.data?.parsed?.info;
    const programData = info?.programData;
    if (!programData) continue; // not an upgradeable program (immutable / not found) → safe

    const pd = await rpc(url, 'getAccountInfo', [programData, { encoding: 'jsonParsed' }]);
    const authority: string | null = pd?.value?.data?.parsed?.info?.authority ?? null;
    if (!authority) continue; // upgrade authority already revoked → immutable → safe

    // Is the authority a plain wallet (System-owned) or a program/multisig PDA?
    const auth = await rpc(url, 'getAccountInfo', [authority, { encoding: 'jsonParsed' }]);
    const owner: string | null = auth?.value?.owner ?? null;
    const isPlainWallet = owner === SYSTEM_PROGRAM;

    findings.push({
      id:       'CHAIN-UPGRADE-001',
      severity: isPlainWallet ? 'HIGH' : 'MEDIUM',
      title:    `Program ${pid} is upgradeable by ${isPlainWallet ? 'a single plain keypair' : 'a program-owned authority'}`,
      detail:   `On ${cluster}, program ${pid} is upgradeable; its upgrade authority is ${authority}${isPlainWallet ? ' (System-owned — a single plain wallet, not a multisig)' : ` (owned by ${owner})`}. Whoever controls this authority can replace the program's code — and thus move any funds it custodies. This contradicts any "trustless / you don't need to trust the team" claim.`,
      location: `${cluster}:${pid}`,
      fix:      'Move the upgrade authority to a well-configured multisig (e.g. Squads) with a timelock, or make the program immutable after audit. Disclose the current upgrade-key trust assumption until then.',
    });
  }

  return findings;
}
