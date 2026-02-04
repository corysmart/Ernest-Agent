jest.mock('dns/promises', () => ({
  lookup: jest.fn(async () => [{ address: '93.184.216.34' }])
}));

import { buildContainer } from '../../server/container';

describe('buildContainer embedding configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DATABASE_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_EMBEDDING_MODEL;
    delete process.env.ANTHROPIC_EMBEDDING_MODEL;
    delete process.env.ANTHROPIC_EMBEDDING_API_KEY;
    delete process.env.ANTHROPIC_EMBEDDING_BASE_URL;
    delete process.env.EMBEDDING_PROVIDER;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws when using Anthropic without embedding provider configuration', async () => {
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'key';
    process.env.ANTHROPIC_MODEL = 'claude-test';
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

    await expect(buildContainer()).rejects.toThrow('EMBEDDING_PROVIDER must be set');
  });

  it('allows a separate embedding provider for Anthropic', async () => {
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'key';
    process.env.ANTHROPIC_MODEL = 'claude-test';
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
    process.env.EMBEDDING_PROVIDER = 'mock';

    await expect(buildContainer()).resolves.toBeDefined();
  });
});
