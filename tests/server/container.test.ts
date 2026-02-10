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

    const containerContext = await buildContainer();
    expect(containerContext).toBeDefined();
    await containerContext.cleanup();
  });

  describe('P2: Rate limiter NaN validation', () => {
    it('rejects NaN capacity from environment variable', async () => {
      process.env.LLM_PROVIDER = 'mock';
      process.env.RATE_LIMIT_CAPACITY = 'not-a-number';

      await expect(buildContainer()).rejects.toThrow('Invalid RATE_LIMIT_CAPACITY');
    });

    it('rejects NaN refill rate from environment variable', async () => {
      process.env.LLM_PROVIDER = 'mock';
      process.env.RATE_LIMIT_REFILL = 'invalid';

      await expect(buildContainer()).rejects.toThrow('Invalid RATE_LIMIT_REFILL');
    });

    it('rejects empty string capacity', async () => {
      process.env.LLM_PROVIDER = 'mock';
      process.env.RATE_LIMIT_CAPACITY = '';

      await expect(buildContainer()).rejects.toThrow('Invalid RATE_LIMIT_CAPACITY');
    });

    it('rejects negative capacity', async () => {
      process.env.LLM_PROVIDER = 'mock';
      process.env.RATE_LIMIT_CAPACITY = '-1';

      await expect(buildContainer()).rejects.toThrow('Invalid RATE_LIMIT_CAPACITY');
    });

    it('rejects zero capacity', async () => {
      process.env.LLM_PROVIDER = 'mock';
      process.env.RATE_LIMIT_CAPACITY = '0';

      await expect(buildContainer()).rejects.toThrow('Invalid RATE_LIMIT_CAPACITY');
    });

    it('accepts valid numeric values', async () => {
      process.env.LLM_PROVIDER = 'mock';
      process.env.RATE_LIMIT_CAPACITY = '100';
      process.env.RATE_LIMIT_REFILL = '5';

      const containerContext = await buildContainer();
      expect(containerContext).toBeDefined();
      await containerContext.cleanup();
    });
  });
});
