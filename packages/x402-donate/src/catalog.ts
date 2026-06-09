import type { Charity, EndaomentOrg } from './types.js';
import { BASE_CHAIN_ID, FEES } from './config.js';

const ENDAOMENT_API = 'https://api.endaoment.org/v1/orgs';
const CACHE_TTL_MS  = 4 * 60 * 60 * 1000; // 4 hours

let cache: Map<string, Charity> = new Map();    // slug → Charity
let byId:  Map<string, Charity> = new Map();    // Endaoment UUID → Charity
let byEin: Map<string, Charity> = new Map();    // EIN → Charity
let lastFetch  = 0;
let buildDone  = false;
let buildPromise: Promise<void> | null = null;

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function toCharity(org: EndaomentOrg): Charity | null {
  const deployment = org.deployments?.find(d => d.chainId === BASE_CHAIN_ID);
  if (!deployment) return null;

  return {
    id:          org.id,
    slug:        toSlug(org.name),
    ein:         org.ein,
    name:        org.name,
    description: org.description,
    logo:        org.logo,
    category:    org.nteeDescription ?? '',
    website:     org.website ?? '',
    baseAddress: deployment.contractAddress,
    isDeployed:  deployment.isDeployed,
    totalRaisedUsdc: Number(org.lifetimeContributionsUsdc ?? 0) / 1e6,
    fees: {
      endaomentAdminPct: FEES.endaomentAdminPct,
      servicePct:        FEES.servicePct,
      gasEstimateUsd:    FEES.gasEstimateUsd,
      note:              `Endaoment charges a ${FEES.endaomentAdminPct}% administrative fee. This service charges 0%. Payment goes directly from your wallet to the charity's Base contract — we never hold funds.`,
    },
  };
}

function registerOrg(org: EndaomentOrg): void {
  const charity = toCharity(org);
  if (!charity) return;

  let slug = charity.slug;
  let n = 2;
  while (cache.has(slug)) slug = `${charity.slug}-${n++}`;
  charity.slug = slug;

  cache.set(slug, charity);
  byId.set(charity.id, charity);
  if (charity.ein) byEin.set(charity.ein, charity);
}

async function fetchPage(offset: number): Promise<EndaomentOrg[]> {
  const url = new URL(ENDAOMENT_API);
  url.searchParams.set('limit', '100');
  url.searchParams.set('offset', String(offset));

  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Endaoment API error: ${res.status}`);
  return res.json() as Promise<EndaomentOrg[]>;
}

// Live lookup by Endaoment UUID — O(1), no pagination needed
async function fetchByUuid(uuid: string): Promise<Charity | null> {
  const res = await fetch(`${ENDAOMENT_API}/${uuid}`, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const org = await res.json() as EndaomentOrg;
  return toCharity(org);
}

// Background full build — registers orgs as each page arrives (no blocking)
function startBackgroundBuild(): void {
  if (buildPromise) return;
  buildPromise = (async () => {
    let offset = 0;
    let page: EndaomentOrg[] = [];
    do {
      page = await fetchPage(offset);
      page.forEach(registerOrg);
      offset += page.length;
    } while (page.length > 0);
    lastFetch = Date.now();
    buildDone  = true;
    buildPromise = null;
    console.log(`[catalog] full load complete — ${cache.size} charities indexed`);
  })().catch(err => {
    buildPromise = null;
    console.error('[catalog] background build error:', err);
  });
}

// Kick off immediately — pages stream into cache while server handles requests
startBackgroundBuild();

// Refresh when TTL expires
setInterval(() => {
  if (Date.now() - lastFetch > CACHE_TTL_MS) {
    buildDone = false;
    startBackgroundBuild();
  }
}, 60 * 60 * 1000);

export async function listCharities(opts: {
  search?: string;
  limit?: number;
  offset?: number;
  category?: string;
}): Promise<{ charities: Charity[]; total: number; catalogReady: boolean }> {
  const { search, limit = 20, offset = 0, category } = opts;

  let all = Array.from(cache.values());

  if (search) {
    const lc = search.toLowerCase();
    all = all.filter(c =>
      c.name.toLowerCase().includes(lc) ||
      (c.description && c.description.toLowerCase().includes(lc)) ||
      (c.ein && c.ein.includes(lc))
    );
  }

  if (category) {
    const lc = category.toLowerCase();
    all = all.filter(c => c.category.toLowerCase().includes(lc));
  }

  return {
    charities:     all.slice(offset, offset + limit),
    total:         all.length,
    catalogReady:  buildDone,
  };
}

export async function findCharity(slugOrEinOrId: string): Promise<Charity | null> {
  // Try slug (requires cache — best-effort from whatever pages have loaded)
  if (cache.has(slugOrEinOrId)) return cache.get(slugOrEinOrId)!;

  // Try EIN
  if (byEin.has(slugOrEinOrId)) return byEin.get(slugOrEinOrId)!;

  // Try Endaoment UUID — direct API lookup, no cache dependency
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (UUID_RE.test(slugOrEinOrId)) {
    if (byId.has(slugOrEinOrId)) return byId.get(slugOrEinOrId)!;
    const charity = await fetchByUuid(slugOrEinOrId);
    if (charity) { registerOrg({ ...charity } as unknown as EndaomentOrg); }
    return charity;
  }

  return null;
}
