/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'core/**/*.ts',
    'memory/**/*.ts',
    'world/**/*.ts',
    'self/**/*.ts',
    'goals/**/*.ts',
    'agents/**/*.ts',
    'llm/**/*.ts',
    'env/**/*.ts',
    'runtime/**/*.ts',
    'server/**/*.ts',
    'security/**/*.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};
