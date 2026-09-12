// What can be bought, what it costs, and what is not self-serve yet.
import { API } from './types.js';
import type { TierInfo } from './types.js';

async function main() {
  const res = await fetch(`${API}/audit/tiers`);
  if (!res.ok) throw new Error(`${API}/audit/tiers → ${res.status}`);
  const { tiers, note } = await res.json() as { tiers: TierInfo[]; note: string };

  console.log('\nTier  Price      Returns   Turnaround      Status');
  console.log('─'.repeat(72));
  for (const t of tiers) {
    const price  = t.priceUsdc === null ? (t.tier === 'T0' ? 'free' : 'quote') : `$${t.priceUsdc}`;
    const status = t.available ? 'available' : 'not self-serve';
    console.log(
      `${t.tier.padEnd(5)} ${price.padEnd(10)} ${t.detail.padEnd(9)} ${t.turnaround.padEnd(15)} ${status}`,
    );
    console.log(`      ${t.summary}`);
    if (t.blockedOn) console.log(`      blocked on: ${t.blockedOn}`);
    console.log();
  }
  console.log(note);
}

main().catch(e => { console.error('failed:', e.message); process.exit(1); });
