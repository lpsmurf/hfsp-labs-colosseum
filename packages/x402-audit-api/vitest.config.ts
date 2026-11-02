import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests only by default: no network, no token, fast enough to run on
    // every rule change. The precision gates under tests/integration/ hit the
    // GitHub API and are opt-in via `npm run test:integration`.
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
    // src/config.ts exits when required payment settings are missing; unit
    // tests never move money, so placeholder recipients are enough.
    env: {
      PAYMENT_RECIPIENT_BASE: '0x0000000000000000000000000000000000000001',
      PAYMENT_RECIPIENT_SOL: '11111111111111111111111111111111',
    },
  },
});
