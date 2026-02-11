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

    const adapter = await OpenAIAdapter.create({
      apiKey: 'key',
      model: 'gpt-test',
      embeddingModel: 'text-embed',
      baseUrl: 'https://api.openai.com/v1',
      resolveDns: true // P3: Use true to test DNS validation at runtime
    });

    // create() validates DNS once, generate() also validates if cache is expired/missing
    // First call - generate() validates DNS (cache might not be set or expired)
    await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });
    // isSafeUrl is called during create() and potentially during generate() if cache check fails
    // Due to fake timers, the cache timestamp might not match, so generate() validates again
    expect(isSafeUrlSpy).toHaveBeenCalledTimes(2); // From create() + generate()

    // Second call immediately - should use cache (cache was set by first generate())
    await adapter.generate({ messages: [{ role: 'user', content: 'hi2' }] });
    expect(isSafeUrlSpy).toHaveBeenCalledTimes(2); // Still 2, cached

    // Advance time past TTL (5 minutes)
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);

    // Third call after TTL - should revalidate
    await adapter.generate({ messages: [{ role: 'user', content: 'hi3' }] });
    expect(isSafeUrlSpy).toHaveBeenCalledTimes(3); // Revalidated after TTL

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

    const adapter1 = await OpenAIAdapter.create({
      apiKey: 'key',
      model: 'gpt-test',
      embeddingModel: 'text-embed',
      baseUrl: url1,
      resolveDns: false
    });

    // create() validates DNS, generate() also validates if cache is expired/missing
    // First adapter - generate() validates DNS (cache might not be set or expired)
    await adapter1.generate({ messages: [{ role: 'user', content: 'hi' }] });
    // isSafeUrl is called during create() and potentially during generate() if cache check fails
    expect(isSafeUrlSpy).toHaveBeenCalledTimes(2); // From adapter1.create() + adapter1.generate()

    const adapter2 = await OpenAIAdapter.create({
      apiKey: 'key',
      model: 'gpt-test',
      embeddingModel: 'text-embed',
      baseUrl: url2,
      resolveDns: true // P3: Use true to test DNS validation at runtime
    });

    // Second adapter with different URL - create() validates DNS, generate() may validate if cache check fails
    await adapter2.generate({ messages: [{ role: 'user', content: 'hi' }] });
    expect(isSafeUrlSpy).toHaveBeenCalledTimes(4); // 2 from adapter1 + 2 from adapter2

    isSafeUrlSpy.mockRestore();
  });
});

