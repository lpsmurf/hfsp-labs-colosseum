import type { RepoFile } from '../github.js';
import type { Finding } from '../report.js';
import { langOf, stripComments } from '../lang.js';

// Supply-chain and command-execution rules.
//
// These are the two gaps found during the ProxyGate CLI review: an npm lifecycle
// script that runs attacker-chosen code at install time, and a shell sink that
// concatenates untrusted input into a command line.
//
// Both matter more for agent tooling than for a normal web service. An MCP
// server or CLI that an agent installs runs with the developer's own privileges
// and sits next to their credentials, so "npm install" is the whole attack. A
// contract auditor that never looks at package.json misses the one file that
// executes on every machine that touches the repo.

interface Rule {
  id:         string;
  severity:   Finding['severity'];
  confidence: NonNullable<Finding['confidence']>;
  title:      string;
  detail:     string;
  fix:        string;
  refs:       string[];
}

// ---------------------------------------------------------------------------
// npm lifecycle scripts
// ---------------------------------------------------------------------------

// Scripts npm runs without being asked. `prepare` also runs on `npm install`.
const LIFECYCLE = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish'];

// What a lifecycle script does that turns it from a build step into an implant.
const DANGEROUS_SCRIPT: Array<{ re: RegExp; why: string }> = [
  {
    re: /\b(?:curl|wget)\b[^|&;]*[|]\s*(?:ba|z|d|k)?sh\b/i,
    why: 'downloads a remote script and pipes it straight into a shell',
  },
  {
    re: /\b(?:curl|wget)\b[^&;]*\s-o\s|\bfetch\s+http/i,
    why: 'downloads a remote file at install time',
  },
  {
    re: /\bnode\s+-e\b|\bnode\s+--eval\b/i,
    why: 'executes an inline Node expression rather than a checked-in script',
  },
  {
    re: /base64\s+(?:-d|--decode)|atob\s*\(|Buffer\.from\([^)]*['"]base64['"]/i,
    why: 'decodes base64 at install time, which is how payloads are hidden from review',
  },
  {
    re: /(?:\$HOME|~|\$\{HOME\})\/\.(?:claude|codex|cursor|aws|ssh|config|npmrc|gitconfig|zshrc|bashrc|profile)/i,
    why: 'writes into the developer\'s home-directory configuration',
  },
  {
    re: /settings\.json|mcp\.json|claude_desktop_config/i,
    why: 'touches an agent or editor configuration file, which can register new tools or hooks',
  },
  {
    re: /\bchmod\s+\+x\b|\bsudo\b/i,
    why: 'changes permissions or escalates privilege during install',
  },
  {
    re: /\/dev\/tcp\/|\bnc\s+-|\bncat\b|\bsocat\b/i,
    why: 'opens a raw network connection, a reverse-shell primitive',
  },
];

const LIFECYCLE_RULE: Rule = {
  id:         'SUPPLY-001',
  severity:   'CRITICAL',
  confidence: 'HIGH',
  title:      'npm lifecycle script executes untrusted code at install time',
  detail:     '',  // filled per match
  fix:        'Remove the lifecycle script, or reduce it to a checked-in, reviewable build step with no network access and no writes outside the package directory. Consumers can defend themselves with `npm install --ignore-scripts`, but that is their mitigation, not yours. If a native build step is genuinely required, publish prebuilt binaries instead.',
  refs:       ['CWE-506', 'CWE-829', 'https://docs.npmjs.com/cli/v10/using-npm/scripts#life-cycle-scripts'],
};

const LIFECYCLE_PRESENT: Rule = {
  id:         'SUPPLY-002',
  severity:   'LOW',
  confidence: 'HIGH',
  title:      'npm lifecycle script present',
  detail:     '',
  fix:        'Confirm the script is a genuine build step. Anything that fetches, decodes or writes outside the package directory should be removed — install-time code runs on every machine that installs this package, with that developer\'s privileges.',
  refs:       ['https://docs.npmjs.com/cli/v10/using-npm/scripts#life-cycle-scripts'],
};

const NON_REGISTRY_DEP: Rule = {
  id:         'SUPPLY-003',
  severity:   'MEDIUM',
  confidence: 'HIGH',
  title:      'Dependency resolved from outside the npm registry',
  detail:     '',
  fix:        'Depend on a published, version-pinned registry package. A git or tarball URL has no immutable version: the contents behind a branch or a URL can change after review, and neither `npm audit` nor advisory databases cover it.',
  refs:       ['CWE-829'],
};

function checkPackageJson(file: RepoFile): Finding[] {
  const findings: Finding[] = [];

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(file.content) as Record<string, unknown>;
  } catch {
    return findings; // not parseable — nothing reliable to say
  }

  const scripts = (pkg.scripts ?? {}) as Record<string, string>;

  for (const name of LIFECYCLE) {
    const body = scripts[name];
    if (typeof body !== 'string' || !body.trim()) continue;

    const hits = DANGEROUS_SCRIPT.filter(d => d.re.test(body));

    if (hits.length > 0) {
      findings.push({
        ...LIFECYCLE_RULE,
        title:    `npm "${name}" script executes untrusted code at install time`,
        detail:   `The \`${name}\` script runs automatically on \`npm install\`, before any code in this package is imported and without the installing developer reading it. This one ${hits.map(h => h.why).join(', and ')}. The script is: \`${body.slice(0, 200)}\`. On a developer or CI machine this executes with full user privileges alongside their credentials, SSH keys and agent configuration.`,
        location: file.path,
      });
    } else {
      findings.push({
        ...LIFECYCLE_PRESENT,
        title:    `npm "${name}" script present`,
        detail:   `The \`${name}\` script runs automatically on \`npm install\`: \`${body.slice(0, 200)}\`. Nothing in it matched a known-dangerous pattern, but install-time execution is worth confirming deliberately rather than by omission.`,
        location: file.path,
      });
    }
  }

  // Dependencies that do not come from the registry.
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const deps = (pkg[field] ?? {}) as Record<string, string>;
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec !== 'string') continue;
      if (!/^(?:git|git\+|https?:|github:|file:|[\w-]+\/[\w-]+$)/.test(spec)) continue;
      if (/^file:/.test(spec) && /^\.{1,2}\//.test(spec.slice(5))) continue; // local workspace path
      findings.push({
        ...NON_REGISTRY_DEP,
        detail:   `\`${field}.${name}\` resolves to \`${spec}\` rather than a registry version. Whatever is behind that reference can change without a version bump, so a review of this repo does not pin what actually gets installed.`,
        location: `${file.path} → ${field}.${name}`,
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Shell sinks
// ---------------------------------------------------------------------------

// exec/execSync run their argument through a shell, so any interpolation is a
// command-injection sink. execFile/spawn without shell:true do not.
const EXEC_INTERPOLATED =
  /\b(?:child_process\s*\.\s*)?exec(?:Sync)?\s*\(\s*(?:`[^`]*\$\{|['"][^'"]*['"]\s*\+|\w+\s*\+)/;

const EXEC_TEMPLATE_ONLY = /\b(?:child_process\s*\.\s*)?exec(?:Sync)?\s*\(\s*`[^`]*\$\{/;

const SHELL_TRUE = /\b(?:spawn|spawnSync|execFile|execFileSync|fork)\s*\([^)]*shell\s*:\s*true/s;

const DYNAMIC_EVAL =
  /\beval\s*\(|new\s+Function\s*\(|vm\s*\.\s*run(?:InNewContext|InThisContext|InContext)\s*\(/;

const EXEC_RULE: Rule = {
  id:         'SUPPLY-004',
  severity:   'HIGH',
  confidence: 'MEDIUM',
  title:      'Shell command built by string interpolation',
  detail:     '`exec` and `execSync` pass their argument to a shell, so any interpolated value is interpreted as shell syntax, not as data. A value containing `;`, `|`, `&&` or `$( )` runs additional commands with the process\'s privileges. In a CLI or MCP server those privileges are the developer\'s own.',
  fix:        'Use `execFile`/`spawn` with the command and an argument array — no shell is involved, so arguments cannot be reinterpreted as syntax. If a shell is genuinely required, allowlist the input against a strict pattern; escaping shell metacharacters by hand is not reliable.',
  refs:       ['CWE-78', 'CWE-88'],
};

const SHELL_TRUE_RULE: Rule = {
  id:         'SUPPLY-005',
  severity:   'MEDIUM',
  confidence: 'HIGH',
  title:      'spawn/execFile called with shell: true',
  detail:     '`shell: true` reintroduces the shell that `spawn` and `execFile` exist to avoid, so the argument array is re-parsed as shell syntax and the injection-safety of the array form is lost.',
  fix:        'Drop `shell: true` and pass the executable plus an argument array. Where a shell builtin or pipeline is needed, invoke the shell explicitly with a fixed script and pass data via arguments or stdin.',
  refs:       ['CWE-78'],
};

const EVAL_RULE: Rule = {
  id:         'SUPPLY-006',
  severity:   'HIGH',
  confidence: 'LOW',
  title:      'Dynamic code execution (eval / new Function / vm)',
  detail:     'Code is compiled at runtime. If any part of the evaluated string can be influenced by a request, a config file, an LLM response or a remote fetch, that input becomes code running with full process privileges.',
  fix:        'Replace with explicit parsing or a lookup table. Where dynamic behaviour is unavoidable, parse into a restricted interpreter rather than evaluating as JavaScript. Flagged for review — confirm where the evaluated string comes from.',
  refs:       ['CWE-95', 'CWE-94'],
};

function checkShellSinks(file: RepoFile): Finding[] {
  const findings: Finding[] = [];
  const src = stripComments(file.content);

  if (EXEC_INTERPOLATED.test(src)) {
    findings.push({
      ...EXEC_RULE,
      // A template literal with a placeholder is the clearer signal; plain
      // concatenation is more often a constant being assembled.
      confidence: EXEC_TEMPLATE_ONLY.test(src) ? 'HIGH' : 'MEDIUM',
      location:   file.path,
    });
  }

  if (SHELL_TRUE.test(src)) {
    findings.push({ ...SHELL_TRUE_RULE, location: file.path });
  }

  if (DYNAMIC_EVAL.test(src)) {
    findings.push({ ...EVAL_RULE, location: file.path });
  }

  return findings;
}

export function checkSupplyChain(file: RepoFile): Finding[] {
  if (/(?:^|\/)package\.json$/.test(file.path)) return checkPackageJson(file);
  if (langOf(file.path) === 'js') return checkShellSinks(file);
  return [];
}
