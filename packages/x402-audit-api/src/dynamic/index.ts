import { probeAuthBypass } from './auth-bypass.js';
import { probeCors }       from './cors-probe.js';
import { probeInfoLeak }   from './info-leak.js';
import type { Finding }    from '../report.js';

export async function runDynamicProbes(endpoint: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  const [bypass, cors, info] = await Promise.allSettled([
    probeAuthBypass(endpoint),
    probeCors(endpoint),
    probeInfoLeak(endpoint),
  ]);

  if (bypass.status === 'fulfilled') findings.push(...bypass.value);
  if (cors.status   === 'fulfilled') findings.push(...cors.value);
  if (info.status   === 'fulfilled') findings.push(...info.value);

  return findings;
}
