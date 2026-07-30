module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/__tests__'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  maxWorkers: '50%',
  // @solana/web3.js pulls in a nested uuid whose "node" export is ESM-only, which
  // Jest's CJS runtime cannot parse — it made every suite that touches web3.js
  // fail to load at all. Point uuid at the root v9 CommonJS build instead.
  moduleNameMapper: {
    '^uuid$': require.resolve('uuid'),
  },
  testPathIgnorePatterns: [
    'week1-endpoints',
    'integration-full-flow',
    'mempalace-integration'
  ],
};
