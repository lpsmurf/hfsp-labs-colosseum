import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Load catalogs once at module init
const skillsData  = require('../data/solana-skills.json');
const mcpsData    = require('../data/solana-mcps.json');
const reposData   = require('../data/clonable-repos.json');

interface Skill {
  slug: string; title: string; description: string;
  github_url?: string; raw_url?: string; url?: string; category?: any;
}
interface MCP {
  id: string; name: string; repo: string; description: string;
  category: string; url: string; keywords: string[]; setup_command: string;
}
interface Repo {
  id: string; repo: string; description: string;
  category: string; keywords: string[]; clone_command: string; is_template: boolean;
}

const allSkills: Skill[] = [
  ...(skillsData.official_skills ?? []),
  ...(skillsData.community_skills ?? []),
];
const allMCPs: MCP[] = mcpsData.mcps ?? [];
const allRepos: Repo[] = reposData.repos ?? [];

function score(text: string, terms: string[]): number {
  const t = text.toLowerCase();
  return terms.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
}

function searchSkills(terms: string[], limit: number) {
  return allSkills
    .map(s => ({
      s,
      sc: score(`${s.title} ${s.description}`, terms),
    }))
    .filter(x => x.sc > 0)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, limit)
    .map(({ s }) => ({
      type: 'skill' as const,
      title: s.title,
      description: s.description,
      url: s.github_url ?? s.url ?? `https://github.com/solana-foundation/solana-dev-skill`,
      slug: s.slug,
    }));
}

function searchMCPs(terms: string[], limit: number) {
  return allMCPs
    .map(m => ({
      m,
      sc: score(`${m.name} ${m.description} ${m.keywords.join(' ')}`, terms),
    }))
    .filter(x => x.sc > 0)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, limit)
    .map(({ m }) => ({
      type: 'mcp' as const,
      title: m.name,
      description: m.description,
      url: m.url,
      install: m.setup_command,
    }));
}

function searchRepos(terms: string[], limit: number) {
  return allRepos
    .map(r => ({
      r,
      sc: score(`${r.repo} ${r.description} ${r.keywords.join(' ')}`, terms),
    }))
    .filter(x => x.sc > 0)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, limit)
    .map(({ r }) => ({
      type: 'repo' as const,
      title: r.repo,
      description: r.description,
      url: `https://github.com/${r.repo}`,
      clone: r.clone_command,
      is_template: r.is_template,
    }));
}

// ── Tool ─────────────────────────────────────────────────────────────────────

const SearchInput = z.object({
  query: z.string().describe('What to search for, e.g. "NFT minting", "DeFi swap", "token deployment"'),
  filter: z.enum(['all', 'skills', 'mcps', 'repos']).default('all')
    .describe('Which catalog to search. Default: all three.'),
});

const ResultItem = z.object({
  type: z.enum(['skill', 'mcp', 'repo']),
  title: z.string(),
  description: z.string(),
  url: z.string(),
  extra: z.string().optional(),
});

export const searchSolanaEcosystem = createTool({
  id: 'search_solana_ecosystem',
  description:
    'Search the Solana ecosystem catalog — 78 developer skills, 36 MCP servers, and 106 curated repos. ' +
    'Use this when a user asks about building on Solana, wants to find relevant tools, libraries, ' +
    'frameworks, or resources for a specific Solana use case.',
  inputSchema: SearchInput,
  outputSchema: z.object({
    results: z.array(ResultItem),
    total: z.number(),
    query: z.string(),
  }),
  execute: async ({ context }) => {
    const { query, filter } = SearchInput.parse(context);
    const terms = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    const perType = filter === 'all' ? 4 : 10;
    const results: z.infer<typeof ResultItem>[] = [];

    if (filter === 'all' || filter === 'skills') {
      searchSkills(terms, perType).forEach(r =>
        results.push({ type: r.type, title: r.title, description: r.description, url: r.url })
      );
    }
    if (filter === 'all' || filter === 'mcps') {
      searchMCPs(terms, perType).forEach(r =>
        results.push({ type: r.type, title: r.title, description: r.description, url: r.url, extra: r.install })
      );
    }
    if (filter === 'all' || filter === 'repos') {
      searchRepos(terms, perType).forEach(r =>
        results.push({
          type: r.type,
          title: r.title,
          description: r.description,
          url: r.url,
          extra: r.clone,
        })
      );
    }

    return { results, total: results.length, query };
  },
});
