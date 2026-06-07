import { config } from './config.js';

const GH_API = 'https://api.github.com';

export interface RepoFile {
  path: string;
  content: string;
}

export interface RepoMeta {
  owner:       string;
  repo:        string;
  defaultBranch: string;
  commitSha:   string;
  files:       RepoFile[];
  liveEndpoint: string | null;
}

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (config.GITHUB_TOKEN) h['Authorization'] = `Bearer ${config.GITHUB_TOKEN}`;
  return h;
}

async function ghGet(path: string): Promise<unknown> {
  const res = await fetch(`${GH_API}${path}`, {
    headers: ghHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`);
  return res.json();
}

export function parseRepoUrl(raw: string): { owner: string; repo: string } {
  const m = raw.match(/github\.com\/([^/]+)\/([^/\s#?]+)/i);
  if (!m) throw new Error('Not a valid GitHub repo URL');
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

// Files we care about for security analysis — keep the list tight
const WANTED = [
  /\.(ts|js|mjs|cjs)$/,
  /^\.env\.example$/,
  /^\.env\.sample$/,
  /package\.json$/,
  /README\.md$/i,
  /Dockerfile$/i,
  /docker-compose.*\.ya?ml$/i,
];

function isWanted(path: string): boolean {
  return WANTED.some(r => r.test(path));
}

async function fetchTree(owner: string, repo: string, sha: string): Promise<string[]> {
  const data = await ghGet(
    `/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`
  ) as { tree: Array<{ path: string; type: string }> };
  return data.tree
    .filter(f => f.type === 'blob' && isWanted(f.path))
    .map(f => f.path)
    .slice(0, 80); // cap to avoid very large repos
}

async function fetchFile(owner: string, repo: string, path: string): Promise<string> {
  const data = await ghGet(`/repos/${owner}/${repo}/contents/${path}`) as {
    content?: string;
    encoding?: string;
    size?: number;
  };
  if (!data.content) return '';
  if ((data.size ?? 0) > 150_000) return ''; // skip very large files
  return Buffer.from(data.content, 'base64').toString('utf8');
}

// Heuristics to find the live service URL from repo contents
function extractEndpoint(files: RepoFile[]): string | null {
  const candidates: string[] = [];

  for (const f of files) {
    const text = f.content;

    // .env.example / README — look for deployed URLs
    const urlMatches = text.matchAll(
      /https?:\/\/[a-z0-9\-_.]+(?:\.workers\.dev|\.railway\.app|\.onrender\.com|\.fly\.dev|\.vercel\.app|\.up\.railway\.app|\.hf\.space|\.run\.app|\.ngrok[^/\s"']+|\.zuplo\.app)[^\s"'`<>]*/gi
    );
    for (const m of urlMatches) candidates.push(m[0]);

    // package.json homepage / main
    if (f.path === 'package.json') {
      try {
        const pkg = JSON.parse(text) as Record<string, unknown>;
        if (typeof pkg.homepage === 'string') candidates.push(pkg.homepage);
      } catch { /* ignore */ }
    }
  }

  // Prefer candidates that look like API roots (not frontend/dashboard)
  const apiCandidate = candidates.find(u =>
    /api\.|api\/|\/api|service\.|worker\./.test(u)
  );
  return apiCandidate ?? candidates[0] ?? null;
}

export async function fetchRepo(repoUrl: string): Promise<RepoMeta> {
  const { owner, repo } = parseRepoUrl(repoUrl);

  // Get default branch + latest commit
  const repoData = await ghGet(`/repos/${owner}/${repo}`) as {
    default_branch: string;
  };
  const branch = repoData.default_branch;

  const branchData = await ghGet(`/repos/${owner}/${repo}/branches/${branch}`) as {
    commit: { sha: string };
  };
  const commitSha = branchData.commit.sha;

  // Fetch relevant files
  const paths = await fetchTree(owner, repo, commitSha);
  const files: RepoFile[] = [];

  // Fetch in parallel batches of 5
  for (let i = 0; i < paths.length; i += 5) {
    const batch = paths.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(async p => ({ path: p, content: await fetchFile(owner, repo, p) }))
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.content) files.push(r.value);
    }
  }

  const liveEndpoint = extractEndpoint(files);

  return { owner, repo, defaultBranch: branch, commitSha, files, liveEndpoint };
}
