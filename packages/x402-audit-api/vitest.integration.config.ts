import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    // One audit is ~120 sequential GitHub requests; running these in parallel
    // burns the rate limit and produces confusing 503s instead of results.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 120_000,
  },
});
