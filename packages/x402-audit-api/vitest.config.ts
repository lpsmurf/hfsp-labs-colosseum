import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests only by default: no network, no token, fast enough to run on
    // every rule change. The precision gates under tests/integration/ hit the
    // GitHub API and are opt-in via `npm run test:integration`.
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
});
