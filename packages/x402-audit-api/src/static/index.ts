import type { RepoFile } from '../github.js';
import { checkCors }           from './cors.js';
import { checkPaymentBypass }  from './payment.js';
import { checkSecrets }        from './secrets.js';
import { checkSolidity }       from './solidity.js';
import { checkSolana }         from './solana.js';
import { checkVerifyCache }    from './verify-cache.js';
import { checkSupplyChain }    from './supply-chain.js';
import { langOf }              from '../lang.js';
import { T1_ENGINES }          from '../tiers.js';
import type { EngineId }       from '../tiers.js';
import type { Finding }        from '../report.js';

export interface StaticResult {
  findings: Finding[];
  // What the run actually looked at, per language. Reported so a caller can
  // tell "no findings" apart from "nothing this engine understands".
  coverage: Record<string, number>;
  // Files carrying a verification/validation finding. Patch-age scoring only
  // asks GitHub about these — age on an arbitrary file means nothing.
  criticalPaths: string[];
}

// Rule prefixes whose findings mark a file as security-critical for the
// purposes of patch-age scoring.
const CRITICAL_PREFIX = /^(?:VCACHE|SOL-SIG|SOL-PROXY|SOL-REENTRANCY|SOLANA-SIGNER|SOLANA-OWNER|SOLANA-CPI)/;

export async function runStaticAnalysis(files: RepoFile[]): Promise<Finding[]> {
  return (await analyzeStatic(files)).findings;
}

export async function analyzeStatic(
  files:   RepoFile[],
  // Which engines this tier paid for. Defaults to the full T1 set so existing
  // callers keep their behaviour.
  engines: Set<EngineId> = new Set(T1_ENGINES),
): Promise<StaticResult> {
  const findings: Finding[] = [];
  const coverage: Record<string, number> = {};
  const on = (e: EngineId) => engines.has(e);

  for (const file of files) {
    const lang = langOf(file.path);
    coverage[lang] = (coverage[lang] ?? 0) + 1;

    // Secrets can hide in any file type, so that engine sees everything.
    if (on('secrets')) findings.push(...checkSecrets(file));

    // package.json lifecycle scripts and non-registry deps. Keyed on filename
    // rather than language, so it runs before the language switch.
    if (on('supply-chain')) findings.push(...checkSupplyChain(file));

    // The rest are language-specific. Running Solidity patterns over TypeScript
    // was the fastest way to fill a report with nonsense.
    switch (lang) {
      case 'js':
        if (on('cors'))         findings.push(...checkCors(file));
        if (on('payment'))      findings.push(...checkPaymentBypass(file));
        if (on('verify-cache')) findings.push(...checkVerifyCache(file));
        break;
      case 'solidity':
        if (on('solidity'))     findings.push(...checkSolidity(file));
        if (on('verify-cache')) findings.push(...checkVerifyCache(file));
        break;
      case 'rust':
        if (on('solana'))       findings.push(...checkSolana(file));
        if (on('verify-cache')) findings.push(...checkVerifyCache(file));
        break;
      // Bridge and sidechain consensus code. Only the verification-cache rules
      // apply — there is no general C++ rule set here.
      case 'cpp':
        if (on('verify-cache')) findings.push(...checkVerifyCache(file));
        break;
      case 'config':
        // Cargo.toml only — overflow-checks.
        if (on('solana')) findings.push(...checkSolana(file));
        break;
      // 'clarity' and 'move' files are fetched and counted but have no rules
      // yet. Counting them is the point: the coverage map shows the gap instead
      // of a clean report implying the contracts were reviewed.
      default:
        break;
    }
  }

  // Strip the " → fn()" suffix so these are real file paths GitHub can resolve.
  const criticalPaths = [...new Set(
    findings
      .filter(f => CRITICAL_PREFIX.test(f.id))
      .map(f => f.location.split(' → ')[0]),
  )];

  return { findings, coverage, criticalPaths };
}
