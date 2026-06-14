import type { RepoFile } from '../github.js';
import { checkCors }           from './cors.js';
import { checkPaymentBypass }  from './payment.js';
import { checkSecrets }        from './secrets.js';
import { runSast }             from './sast.js';
import { runX402Checks }       from './x402-checks.js';
import type { Finding }        from '../report.js';

export async function runStaticAnalysis(files: RepoFile[]): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const file of files) {
    findings.push(...checkCors(file));
    findings.push(...checkPaymentBypass(file));
    findings.push(...checkSecrets(file));
    findings.push(...runSast(file));
    findings.push(...runX402Checks(file));
  }

  return findings;
}
