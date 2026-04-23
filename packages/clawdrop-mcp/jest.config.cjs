module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/__tests__'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  maxWorkers: '50%',
  testPathIgnorePatterns: [
    'week1-endpoints',
    'integration-full-flow',
    'mempalace-integration'
  ],
};
