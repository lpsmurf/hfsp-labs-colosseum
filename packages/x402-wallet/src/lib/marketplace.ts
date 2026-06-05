const AGENTIC_API = 'https://agentic.market/v1';

// Vendors excluded from display
const BLOCKED_VENDORS = ['stabledomains', 'stable-domains', 'stablephone', 'stableemail', 'stablemerch'];

export interface MarketEndpoint {
  name: string;
  price: string;
  networks: string[];
  url?: string;
}

export interface MarketService {
  id: string;
  name: string;
  description: string;
  category: string;
  logo?: string;
  endpoints: MarketEndpoint[];
  minPrice?: string;
}

export const CATEGORIES = [
  'All',
  'Inference',
  'Data',
  'Search',
  'Media',
  'Social',
  'Trading',
  'Infrastructure',
] as const;

export type Category = typeof CATEGORIES[number];

function isBlocked(service: MarketService): boolean {
  const id = service.id.toLowerCase();
  const name = service.name.toLowerCase();
  return BLOCKED_VENDORS.some(v => id.includes(v) || name.includes(v));
}

export async function fetchServices(query?: string, category?: string): Promise<MarketService[]> {
  try {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category && category !== 'All') params.set('category', category);

    const url = query
      ? `${AGENTIC_API}/services/search?${params}`
      : `${AGENTIC_API}/services?${params}`;

    const res = await fetch(url, { next: { revalidate: 300 } }); // cache 5 min
    if (!res.ok) throw new Error(`Agentic API error: ${res.status}`);

    const data = await res.json() as { services?: MarketService[]; data?: MarketService[] } | MarketService[];
    const raw: MarketService[] = Array.isArray(data) ? data : (data.services ?? (data as { data?: MarketService[] }).data ?? []);

    return raw.filter(s => !isBlocked(s));
  } catch {
    return [];
  }
}
