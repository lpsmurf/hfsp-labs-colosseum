import dns from 'dns/promises';
import net from 'net';
import { probeAuthBypass } from './auth-bypass.js';
import { probeCors }       from './cors-probe.js';
import { probeInfoLeak }   from './info-leak.js';
import type { Finding }    from '../report.js';

function isBlockedIpv4(ip: string): boolean {
  return (
    ip === '0.0.0.0' ||
    ip === '127.0.0.1' ||
    /^10\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    ip === '169.254.169.254'
  );
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fe80:')) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return net.isIP(mapped) === 4 && isBlockedIpv4(mapped);
  }
  return false;
}

// SSRF guard: only probe public HTTPS endpoints
async function assertSafeEndpoint(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Invalid endpoint URL'); }

  if (url.protocol !== 'https:') throw new Error('Endpoint must use HTTPS');

  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) {
    throw new Error('Endpoint resolves to a private or reserved address');
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new Error('Unable to resolve endpoint hostname');
  }

  if (addresses.length === 0) {
    throw new Error('Endpoint hostname did not resolve to any IP address');
  }

  for (const { address } of addresses) {
    const version = net.isIP(address);
    if (version === 4) {
      if (isBlockedIpv4(address)) {
        throw new Error('Endpoint resolves to a private or reserved address');
      }
    } else if (version === 6) {
      if (isBlockedIpv6(address)) {
        throw new Error('Endpoint resolves to a private or reserved address');
      }
    } else {
      throw new Error('Endpoint resolves to an invalid IP address');
    }
  }

  return url;
}

export async function runDynamicProbes(endpoint: string): Promise<Finding[]> {
  await assertSafeEndpoint(endpoint); // throws → caller catches, no probes run
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
