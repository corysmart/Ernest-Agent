import { OpenAIAdapter } from '../../llm/adapters/openai-adapter';
import * as ssrfProtection from '../../security/ssrf-protection';

const fetchMock = jest.fn();

// Clear module-level DNS cache between tests
beforeEach(() => {
  fetchMock.mockReset();
  (global as any).fetch = fetchMock;
  jest.useFakeTimers();
  // Clear DNS cache by reloading module or accessing cache directly
  // Since cache is module-level, we need to reset it
  jest.resetModules();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('DNS Cache TTL', () => {
  it('revalidates DNS after TTL expires', async () => {
    const isSafeUrlSpy = jest.spyOn(ssrfProtection, 'isSafeUrl').mockResolvedValue(true);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello' } }], usage: { total_tokens: 5 } })
    });

    const adapter = new OpenAIAdapter({
      apiKey: 'key',
      model: 'gpt-test',
      embeddingModel: 'text-embed',
      baseUrl: 'https://api.openai.com/v1'
    });

    // First call - should validate DNS
    await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });
    expect(isSafeUrlSpy).toHaveBeenCalledTimes(1);

    // Second call immediately - should use cache
    await adapter.generate({ messages: [{ role: 'user', content: 'hi2' }] });
    expect(isSafeUrlSpy).toHaveBeenCalledTimes(1); // Still 1, cached

    // Advance time past TTL (5 minutes)
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);

    // Third call after TTL - should revalidate
    await adapter.generate({ messages: [{ role: 'user', content: 'hi3' }] });
    expect(isSafeUrlSpy).toHaveBeenCalledTimes(2); // Revalidated

    isSafeUrlSpy.mockRestore();
  });

  it('revalidates DNS if URL changes', async () => {
    const isSafeUrlSpy = jest.spyOn(ssrfProtection, 'isSafeUrl').mockResolvedValue(true);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello' } }], usage: { total_tokens: 5 } })
    });

    // Use unique URLs to avoid cache collisions from other tests
    const url1 = `https://api.openai.com/v1-${Date.now()}`;
    const url2 = `https://api.openai.com/v2-${Date.now()}`;

    const adapter1 = new OpenAIAdapter({
      apiKey: 'key',
      model: 'gpt-test',
      embeddingModel: 'text-embed',
      baseUrl: url1
    });

    // First adapter - should validate DNS
    await adapter1.generate({ messages: [{ role: 'user', content: 'hi' }] });
    expect(isSafeUrlSpy).toHaveBeenCalledTimes(1);

    const adapter2 = new OpenAIAdapter({
      apiKey: 'key',
      model: 'gpt-test',
      embeddingModel: 'text-embed',
      baseUrl: url2
    });

    // Second adapter with different URL - should validate again (different cache key)
    await adapter2.generate({ messages: [{ role: 'user', content: 'hi' }] });
    expect(isSafeUrlSpy).toHaveBeenCalledTimes(2);

    isSafeUrlSpy.mockRestore();
  });
});

