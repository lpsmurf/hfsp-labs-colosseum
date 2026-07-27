/**
 * TxLine (TxODDS) client — World Cup hackathon prep kit.
 *
 * Off-chain pieces are implemented and runnable; the on-chain `subscribe` step
 * is scaffolded with the real program/mint/instruction (drop in the Anchor IDL
 * from /documentation/programs/devnet to make it live).
 *
 * Flow:  subscribe (on-chain) → guest JWT → activate → fetch fixtures/odds.
 *
 * Run:  cp .env.example .env  &&  npm install  &&  npm run demo
 *   (needs TXLINE_JWT + TXLINE_API_TOKEN once you've subscribed + activated)
 */
import "dotenv/config";

const BASE = process.env.TXLINE_BASE_URL ?? "https://txline.txodds.com";
const JWT = process.env.TXLINE_JWT ?? "";
const API_TOKEN = process.env.TXLINE_API_TOKEN ?? "";
// World Cup competition id — confirm against /api/fixtures/snapshot output.
const WC_COMPETITION_ID = process.env.TXLINE_WC_COMPETITION_ID ?? "500005";

// ── On-chain subscription constants (devnet) ─────────────────────────────────
export const TXLINE_PROGRAM_ID = "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J";
export const TXLINE_TOKEN_MINT = "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG";
export const SERVICE_LEVEL = { WORLD_CUP_DELAYED: 1, WORLD_CUP_REALTIME: 12 } as const;

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (JWT) h["Authorization"] = `Bearer ${JWT}`;
  if (API_TOKEN) h["X-Api-Token"] = API_TOKEN;
  return h;
}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders(), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`TxLine ${res.status} ${res.statusText} on ${path}`);
  return res.json();
}

// ── 1. Guest session ─────────────────────────────────────────────────────────
// Verified live: POST /auth/guest/start → { token: "<JWT>" } (HTTP 200, no auth).
export async function startGuestSession(): Promise<{ token: string }> {
  const res = await fetch(`${BASE}/auth/guest/start`, {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: "{}",
  });
  if (!res.ok) throw new Error(`guest/start ${res.status}`);
  return res.json() as Promise<{ token: string }>;
}

// ── 2. On-chain subscribe (scaffold) ─────────────────────────────────────────
// Requires the Anchor IDL + a funded wallet. Shape per devnet docs:
//   program.methods.subscribe(serviceLevelId, weeks).accounts({ user, pricingMatrix,
//     tokenMint, userTokenAccount, tokenTreasuryVault, tokenTreasuryPda,
//     tokenProgram, systemProgram, associatedTokenProgram }).rpc()
export function subscribeInstructionSpec() {
  return {
    programId: TXLINE_PROGRAM_ID,
    tokenMint: TXLINE_TOKEN_MINT,
    method: "subscribe",
    args: { service_level_id: SERVICE_LEVEL.WORLD_CUP_DELAYED, weeks: 4 },
    accounts: [
      "user(signer,writable)", "pricing_matrix", "token_mint", "user_token_account(writable)",
      "token_treasury_vault(writable)", "token_treasury_pda",
      "token_program", "system_program", "associated_token_program",
    ],
    note: "Drop in the Anchor IDL from /documentation/programs/devnet to execute.",
  };
}

// ── 3. Fixtures ───────────────────────────────────────────────────────────────
export interface TxFixture { FixtureId: string; Participant1: string; Participant2: string; StartTime: string }

export async function getFixtures(competitionId: string = WC_COMPETITION_ID): Promise<TxFixture[]> {
  const data = await getJson(`/api/fixtures/snapshot?competitionId=${encodeURIComponent(competitionId)}`);
  return (Array.isArray(data) ? data : (data as { fixtures?: TxFixture[] }).fixtures ?? []) as TxFixture[];
}

// ── 4. Odds (shape TBD — dump and map) ───────────────────────────────────────
export async function getOdds(fixtureId: string): Promise<unknown> {
  return getJson(`/api/odds/snapshot/${encodeURIComponent(fixtureId)}`);
}

// ── Demo ──────────────────────────────────────────────────────────────────────
async function demo() {
  console.log("TxLine prep-kit demo\n");

  // Live connectivity check — guest session needs no auth.
  const guest = await startGuestSession().catch((e) => { console.log("guest/start failed:", e.message); return null; });
  if (guest) console.log(`✓ guest session: token ${guest.token.slice(0, 24)}… (use as Bearer JWT)\n`);

  if (!API_TOKEN) {
    console.log("⚠  No TXLINE_API_TOKEN — subscribe on-chain (free WC tier) + activate to fetch data.");
    console.log("   On-chain subscribe spec:", JSON.stringify(subscribeInstructionSpec(), null, 2));
    console.log("\n   Then activate → API token; put TXLINE_JWT + TXLINE_API_TOKEN in .env and re-run.");
    return;
  }
  const fixtures = await getFixtures();
  console.log(`World Cup fixtures: ${fixtures.length}`);
  for (const f of fixtures.slice(0, 8)) console.log(`  ${f.Participant1} vs ${f.Participant2}  @ ${f.StartTime}  [${f.FixtureId}]`);

  const first = fixtures[0];
  if (first) {
    console.log(`\nRaw odds payload for ${first.FixtureId} (map these fields into a provider):`);
    console.log(JSON.stringify(await getOdds(first.FixtureId), null, 2).slice(0, 1500));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  demo().catch((e) => { console.error(e); process.exit(1); });
}
