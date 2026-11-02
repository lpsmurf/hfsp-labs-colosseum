/**
 * Pay for an audit over x402 on Celo, the way a third-party agent would.
 *
 * Deliberately uses only the stock @x402 client — if this script needs anything
 * from our own code to pay, a real client could not pay either.
 *
 *   CELO_PAYER_PRIVATE_KEY=0x… npx tsx scripts/celo-pay-audit.ts \
 *     [--url http://localhost:3008/audit] [--network celoSepolia] [--repo https://github.com/owner/repo]
 *
 * The payer needs USDC on the chosen network and nothing else: the facilitator
 * pays gas.
 */

import { privateKeyToAccount } from 'viem/accounts';
import { x402Client, x402HTTPClient } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm/exact/client';

const CHAIN_IDS = { celo: 'eip155:42220', celoSepolia: 'eip155:11142220' } as const;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url     = arg('url', 'http://localhost:3008/audit');
const network = arg('network', 'celoSepolia') as keyof typeof CHAIN_IDS;
const repo    = arg('repo', 'https://github.com/x402-foundation/x402');

const key = process.env.CELO_PAYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!key) throw new Error('Set CELO_PAYER_PRIVATE_KEY');
if (!(network in CHAIN_IDS)) throw new Error(`--network must be one of ${Object.keys(CHAIN_IDS).join(', ')}`);

const account = privateKeyToAccount(key);
const caip2 = CHAIN_IDS[network];

// The server offers Base, Solana and Celo in one 402; pin the choice to Celo so
// the test cannot silently pay on another chain.
const client = new x402Client((_version, reqs) => {
  const match = reqs.find(r => r.network === caip2);
  if (!match) throw new Error(`Server offers no ${caip2} option (got ${reqs.map(r => r.network).join(', ')})`);
  return match;
}).register(caip2, new ExactEvmScheme(account));
const http = new x402HTTPClient(client);

const body = JSON.stringify({ repo });
const headers = { 'content-type': 'application/json' };

console.log(`payer ${account.address} → ${url} on ${caip2}`);
const first = await fetch(url, { method: 'POST', headers, body });
if (first.status !== 402) throw new Error(`Expected 402, got ${first.status}: ${await first.text()}`);

const required = http.getPaymentRequiredResponse(h => first.headers.get(h), await first.json().catch(() => undefined));
const payload  = await http.createPaymentPayload(required);

const paid = await fetch(url, {
  method: 'POST',
  headers: { ...headers, ...http.encodePaymentSignatureHeader(payload) },
  body,
});

const settle = (() => {
  try { return http.getPaymentSettleResponse(h => paid.headers.get(h)); } catch { return undefined; }
})();
console.log(`status ${paid.status}`);
if (paid.status === 402) {
  // A second 402 carries the facilitator's reason (insufficient_funds, invalid
  // signature, …) in the same header as the challenge — the body is empty.
  const rejected = http.getPaymentRequiredResponse(h => paid.headers.get(h));
  console.log('rejected', (rejected as { error?: string }).error ?? rejected);
}
if (settle) console.log('settlement', settle);
console.log((await paid.text()).slice(0, 1500));
if (!paid.ok) process.exit(1);
