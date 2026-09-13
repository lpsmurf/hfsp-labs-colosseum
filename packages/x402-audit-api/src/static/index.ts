import type { RepoFile } from '../github.js';
import { checkCors }           from './cors.js';
import { checkPaymentBypass }  from './payment.js';
import { checkSecrets }        from './secrets.js';
import { checkSolidity }       from './solidity.js';
import { checkSolana }         from './solana.js';
import { checkVerifyCache }    from './verify-cache.js';
import { checkSupplyChain }    from './supply-chain.js';
import { checkUncheckedMath }  from './unchecked-math.js';
import { checkDos }            from './dos.js';
import { checkExposure }       from './exposure.js';
import { checkAccessControl, accessControlInventory } from './access-control.js';
import type { AttackSurface }  from './access-control.js';
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
  // Externally reachable state-changing functions and whether each is guarded.
  // A section, not a finding: most of these are permissionless by design, and
  // the value is in handing over the table rather than in an accusation.
  attackSurface?: AttackSurface;
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
        if (on('exposure'))     findings.push(...checkExposure(file));
        break;
      case 'solidity':
        if (on('solidity'))       findings.push(...checkSolidity(file));
        if (on('access-control')) findings.push(...checkAccessControl(file));
        if (on('unchecked-math')) findings.push(...checkUncheckedMath(file));
        if (on('dos'))            findings.push(...checkDos(file));
        if (on('verify-cache'))   findings.push(...checkVerifyCache(file));
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

  // Computed over the whole file set rather than per file: a contract's surface
  // is only meaningful as a total, and "3 of 47 unguarded" is the shape of the
  // answer an auditor wants.
  const attackSurface = on('access-control')
    ? accessControlInventory(files)
    : undefined;

  return { findings, coverage, criticalPaths, attackSurface };
}
