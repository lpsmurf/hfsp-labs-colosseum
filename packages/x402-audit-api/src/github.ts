import { config } from './config.js';
import { isContractLang, langOf } from './lang.js';

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

/** Thrown when GitHub refuses for a reason the caller needs to act on. */
export class GitHubError extends Error {
  constructor(
    readonly status: number,
    readonly kind: 'rate-limit' | 'not-found' | 'other',
    message: string,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

async function ghGet(path: string): Promise<unknown> {
  const res = await fetch(`${GH_API}${path}`, {
    headers: ghHeaders(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    // A 403 with the rate-limit budget at zero is exhaustion, not permission.
    // Reporting it as "private or unreachable" sent us chasing the wrong cause:
    // unauthenticated GitHub allows 60 requests/hour and one audit spends over
    // a hundred, so without a token every audit fails after the first.
    const remaining = res.headers.get('x-ratelimit-remaining');
    if ((res.status === 403 || res.status === 429) && remaining === '0') {
      const resetAt = Number(res.headers.get('x-ratelimit-reset') ?? 0) * 1000;
      const mins    = resetAt ? Math.ceil((resetAt - Date.now()) / 60_000) : null;
      throw new GitHubError(
        res.status,
        'rate-limit',
        `GitHub rate limit exhausted (limit ${res.headers.get('x-ratelimit-limit') ?? '?'}/hour)` +
        `${mins !== null ? `, resets in ~${mins} min` : ''}` +
        `${config.GITHUB_TOKEN ? '' : ' — GITHUB_TOKEN is not set, so requests are unauthenticated at 60/hour'}`,
      );
    }
    if (res.status === 404) {
      throw new GitHubError(404, 'not-found', `Repository or path not found: ${path}`);
    }
    throw new GitHubError(res.status, 'other', `GitHub API ${res.status}: ${path}`);
  }

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
  /\.sol$/,                        // EVM contracts
  /\.rs$/,                         // Solana / Anchor programs
  /\.clar$/,                       // Stacks Clarity contracts
  /\.move$/,                       // Aptos / Sui
  /\.(?:cpp|cc|cxx|hpp|hh)$/,      // Bitcoin Core / Elements sidechain consensus code
  /^\.env\.example$/,
  /^\.env\.sample$/,
  /package\.json$/,
  /Cargo\.toml$/,                  // overflow-checks lives here
  /(?:Anchor|foundry)\.toml$/i,
  /hardhat\.config\.(?:ts|js|cjs)$/,
  /README\.md$/i,
  /Dockerfile$/i,
  /docker-compose.*\.ya?ml$/i,
];

// Vendored dependencies and build output. This matters: aave-v3-core copies
// OpenZeppelin into contracts/dependencies/openzeppelin/, and before that path
// was excluded 9 of 10 findings on that repo were against vendored OZ rather
// than Aave's own code. Two harms, and the quiet one is worse — reporting
// somebody else's bugs is embarrassing, but spending the 120-file budget on
// dependencies means the code we were actually pointed at is never opened and
// the report says CLEAN about files nobody read.
//
const EXCLUDED =
  /(?:^|\/)(?:node_modules|vendor|vendored|dependencies|deps|third[-_]party|target|out|artifacts|cache|coverage|dist|build|\.git)\//i;

// Foundry's lib/, but only in its dependency shape.
//
// Getting this right took two wrong answers. Excluding all of `lib/` skips a
// project's own shared contracts — `lib` is a generic name and Solidity calls a
// reusable contract a `library`. Excluding none of it was justified by the fact
// that Foundry installs dependencies as git submodules, which the tree API
// reports as a single "commit" entry rather than blobs, so their contents are
// invisible. That is true of upstream Foundry repos (solmate, Uniswap/v4-core
// and sablier-labs/lockup expose zero blobs under lib/) and false of the real
// world: 22 of the 40 evmbench corpus repos commit lib/ as ordinary files, one
// of them 6,542 of them. On those, forge-std and OpenZeppelin ate the file
// budget — one audit sent 18 dependency files and 2 real ones.
//
// The distinction that actually works is depth. A dependency is a nested package
// (`lib/forge-std/src/Base.sol`); a project's own library is a direct child
// (`lib/Math.sol`, `src/lib/Math.sol`). So exclude lib/ only when a directory
// follows it.
const EXCLUDED_LIB_DEP = /(?:^|\/)lib\/[^/]+\/.+/i;

// Test code, fuzzing harnesses and audit fixtures. Intentionally unsafe code
// lives here and reporting it is pure noise — Uniswap v3-core keeps Echidna
// harnesses under audits/tob/contracts/crytic/, which produced three findings
// against code written to be broken on purpose.
// Test code, fuzzing harnesses, formal-verification harnesses and audit
// fixtures. Intentionally unsafe code lives here and reporting it is pure noise
// — Uniswap v3-core keeps Echidna harnesses under audits/tob/contracts/crytic/,
// which produced three findings against code written to be broken on purpose,
// and aave-v3-core's certora/harness/ exposes 21 unguarded setters so the
// prover can drive reserve configuration directly. Those 21 were 21 of the 24
// access-control findings on aave, every one of them false.
const EXCLUDED_TESTS =
  /\.t\.sol$|(?:^|\/)(?:tests?|mocks?|crytic|echidna|audits|fixtures|certora|harness(?:es)?|\.certora\w*)\//i;

function isWanted(path: string): boolean {
  if (EXCLUDED.test(path) || EXCLUDED_LIB_DEP.test(path) || EXCLUDED_TESTS.test(path)) return false;
  return WANTED.some(r => r.test(path));
}

const MAX_FILES = 120;

// When a repo has more interesting files than the budget allows, spend it on the
// code that holds funds first and the packaging last.
function priority(path: string): number {
  if (isContractLang(path)) return 0;
  const l = langOf(path);
  if (l === 'js')     return 1;
  if (l === 'config') return 2;
  return 3;
}

/**
 * Which of a repo's paths an audit actually reads, and in what order.
 *
 * Exported so an offline benchmark measures the same file set a paid audit
 * would. Recall is meaningless if the harness reads files the product never
 * opens — a bug in file 300 of a large repo is a genuine miss, not a rule gap.
 */
export function selectFiles(paths: string[]): string[] {
  return paths
    .filter(isWanted)
    .sort((a, b) => priority(a) - priority(b))
    .slice(0, MAX_FILES);
}

async function fetchTree(owner: string, repo: string, sha: string): Promise<string[]> {
  const data = await ghGet(
    `/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`
  ) as { tree: Array<{ path: string; type: string }> };
  return selectFiles(
    data.tree.filter(f => f.type === 'blob').map(f => f.path),
  );
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

// Last commit date for one path, for patch-age scoring. Returns null rather
// than throwing: an unknown age must not fail an audit.
export async function ghCommitsForPath(
  owner: string,
  repo:  string,
  path:  string,
): Promise<string | null> {
  try {
    const data = await ghGet(
      `/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`
    ) as Array<{ commit?: { committer?: { date?: string } } }>;
    return data[0]?.commit?.committer?.date ?? null;
  } catch {
    return null;
  }
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
