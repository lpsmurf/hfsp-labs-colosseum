import { describe, expect, it } from 'vitest';
import { calculateCost } from './x402-payments.js';

describe('x402-payments', () => {
  it('uses the required base cost per Ace service', async () => {
    await expect(calculateCost('price-feed', 1000)).resolves.toBe(0.001);
    await expect(calculateCost('analytics', 1000)).resolves.toBe(0.0015);
    await expect(calculateCost('sentiment', 1000)).resolves.toBe(0.001);
  });

  it('adds a tiny surcharge for larger payloads', async () => {
    await expect(calculateCost('price-feed', 1500)).resolves.toBe(0.001005);
  });
});

