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

// Curated x402-compatible services
const CURATED_SERVICES: MarketService[] = [
  {
    id: 'hfsp-gnosis-bridge',
    name: 'Gnosis Pay Bridge',
    description: 'Top up your Gnosis Pay Safe with USDC from Solana or Base. ~90s settlement via Relay.link.',
    category: 'Infrastructure',
    endpoints: [
      { name: 'Get Quote', price: 'Free', networks: ['solana', 'base'] },
      { name: 'Top Up Safe', price: '$0.005 USDC + 0.5%', networks: ['solana', 'base'], url: 'https://api.clawdrop.live/api/card/topup' },
    ],
    minPrice: '$0.005',
  },
  {
    id: 'hfsp-polymarket-agent',
    name: 'Polymarket Signal Agent',
    description: 'Autonomous agent scanning 10K+ Polymarket prediction markets. Sends signals via Telegram.',
    category: 'Trading',
    endpoints: [
      { name: 'Market Scan', price: '$0.01 USDC', networks: ['solana'] },
      { name: 'Price Monitor', price: '$0.001 USDC', networks: ['solana'] },
    ],
    minPrice: '$0.001',
  },
  {
    id: 'hfsp-news-digest',
    name: 'Crypto News Digest',
    description: 'Twice-daily crypto news digests (9am + 5pm NY) with curated article links.',
    category: 'Data',
    endpoints: [
      { name: 'News Digest', price: '$0.005 USDC', networks: ['solana'] },
    ],
    minPrice: '$0.005',
  },
  {
    id: 'x402-anthropic-claude',
    name: 'Claude API (x402)',
    description: 'Claude claude-sonnet-4-6 and Claude Opus via x402. Pay per token, no API key needed.',
    category: 'Inference',
    endpoints: [
      { name: 'claude-sonnet-4-6 Messages', price: '$0.003 / 1K tokens', networks: ['base', 'solana'] },
      { name: 'claude-opus-4-8 Messages', price: '$0.015 / 1K tokens', networks: ['base', 'solana'] },
    ],
    minPrice: '$0.003',
  },
  {
    id: 'x402-openai',
    name: 'OpenAI GPT (x402)',
    description: 'GPT-4o and GPT-4o-mini via x402 payment protocol. Pay per request.',
    category: 'Inference',
    endpoints: [
      { name: 'GPT-4o', price: '$0.005 / request', networks: ['base'] },
      { name: 'GPT-4o-mini', price: '$0.0005 / request', networks: ['base'] },
    ],
    minPrice: '$0.0005',
  },
  {
    id: 'x402-perplexity',
    name: 'Perplexity Search',
    description: 'Real-time web search with AI summaries. Pay per query via x402.',
    category: 'Search',
    endpoints: [
      { name: 'sonar', price: '$0.001 / query', networks: ['base', 'solana'] },
      { name: 'sonar-pro', price: '$0.005 / query', networks: ['base', 'solana'] },
    ],
    minPrice: '$0.001',
  },
  {
    id: 'x402-helius',
    name: 'Helius Solana RPC',
    description: 'High-performance Solana RPC and enhanced transaction APIs. Pay per call.',
    category: 'Infrastructure',
    endpoints: [
      { name: 'Enhanced Transactions', price: '$0.0001 / tx', networks: ['solana'] },
      { name: 'Webhook Streams', price: '$0.001 / event', networks: ['solana'] },
    ],
    minPrice: '$0.0001',
  },
  {
    id: 'x402-coingecko',
    name: 'CoinGecko Price Feed',
    description: 'Real-time and historical crypto price data. Pay per API call, no key needed.',
    category: 'Data',
    endpoints: [
      { name: 'Price Quote', price: '$0.0005 / call', networks: ['base', 'solana'] },
      { name: 'OHLCV Historical', price: '$0.002 / call', networks: ['base', 'solana'] },
    ],
    minPrice: '$0.0005',
  },
  {
    id: 'x402-pinata',
    name: 'Pinata IPFS Storage',
    description: 'Decentralized file storage on IPFS. Pay per upload and retrieval via x402.',
    category: 'Infrastructure',
    endpoints: [
      { name: 'Pin File', price: '$0.01 / MB', networks: ['base'] },
      { name: 'Retrieve File', price: '$0.001 / request', networks: ['base'] },
    ],
    minPrice: '$0.001',
  },
  {
    id: 'x402-exa',
    name: 'Exa AI Search',
    description: 'Semantic web search for AI agents. Find exact pages and content with neural search.',
    category: 'Search',
    endpoints: [
      { name: 'Semantic Search', price: '$0.001 / query', networks: ['base', 'solana'] },
      { name: 'Content Extract', price: '$0.002 / page', networks: ['base', 'solana'] },
    ],
    minPrice: '$0.001',
  },
];

function isBlocked(service: MarketService): boolean {
  const id = service.id.toLowerCase();
  const name = service.name.toLowerCase();
  return BLOCKED_VENDORS.some(v => id.includes(v) || name.includes(v));
}

export async function fetchServices(query?: string, category?: string): Promise<MarketService[]> {
  let services = CURATED_SERVICES.filter(s => !isBlocked(s));

  if (category && category !== 'All') {
    services = services.filter(s => s.category === category);
  }

  if (query) {
    const q = query.toLowerCase();
    services = services.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  }

  return services;
}
