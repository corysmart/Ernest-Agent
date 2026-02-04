import { OpenAIAdapter } from '../../llm/adapters/openai-adapter';
import { AnthropicAdapter } from '../../llm/adapters/anthropic-adapter';
import { LocalLLMAdapter } from '../../llm/adapters/local-adapter';
import * as ssrfProtection from '../../security/ssrf-protection';

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (global as any).fetch = fetchMock;
});

describe('DNS Validation During API Calls', () => {
  beforeEach(() => {
    // Reset module-level cache by reloading the module
    jest.resetModules();
  });

  it('validates DNS before OpenAI generate API call', async () => {
    const isSafeUrlSpy = jest.spyOn(ssrfProtection, 'isSafeUrl').mockResolvedValue(true);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello' } }], usage: { total_tokens: 5 } })
    });

    // Use a unique URL to avoid cache hits
    const uniqueUrl = `https://api.openai.com/v1-${Date.now()}`;
    const adapter = await OpenAIAdapter.create({
      apiKey: 'key',
      model: 'gpt-test',
      embeddingModel: 'text-embed',
      baseUrl: uniqueUrl,
      resolveDns: false
    });

    await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });

    // DNS validation should be called before fetch
    expect(isSafeUrlSpy).toHaveBeenCalledWith(uniqueUrl);
    expect(fetchMock).toHaveBeenCalled();
    
    isSafeUrlSpy.mockRestore();
  });

  it('validates DNS before OpenAI embed API call', async () => {
    const isSafeUrlSpy = jest.spyOn(ssrfProtection, 'isSafeUrl').mockResolvedValue(true);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2] }] })
    });

    // Use a unique URL to avoid cache hits
    const uniqueUrl = `https://api.openai.com/v1-embed-${Date.now()}`;
    const adapter = await OpenAIAdapter.create({
      apiKey: 'key',
      model: 'gpt-test',
      embeddingModel: 'text-embed',
      baseUrl: uniqueUrl,
      resolveDns: false
    });

    await adapter.embed('test text');

    // DNS validation should be called before fetch
    expect(isSafeUrlSpy).toHaveBeenCalledWith(uniqueUrl);
    expect(fetchMock).toHaveBeenCalled();
    
    isSafeUrlSpy.mockRestore();
  });

  it('rejects API call if DNS validation fails during generate', async () => {
    const isSafeUrlSpy = jest.spyOn(ssrfProtection, 'isSafeUrl').mockResolvedValue(false);

    const adapter = await OpenAIAdapter.create({
      apiKey: 'key',
      model: 'gpt-test',
      embeddingModel: 'text-embed',
      baseUrl: 'https://evil.example.com',
      resolveDns: false
    });

    await expect(
      adapter.generate({ messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow('Unsafe URL detected');

    expect(fetchMock).not.toHaveBeenCalled();
    isSafeUrlSpy.mockRestore();
  });

  it('validates DNS before Anthropic generate API call', async () => {
    const isSafeUrlSpy = jest.spyOn(ssrfProtection, 'isSafeUrl').mockResolvedValue(true);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: 'hello' }], usage: { input_tokens: 2, output_tokens: 3 } })
    });

    const adapter = await AnthropicAdapter.create({
      apiKey: 'key',
      model: 'claude-test',
      baseUrl: 'https://api.anthropic.com/v1',
      resolveDns: false
    });

    await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });

    expect(isSafeUrlSpy).toHaveBeenCalledWith('https://api.anthropic.com/v1');
    expect(fetchMock).toHaveBeenCalled();
    
    isSafeUrlSpy.mockRestore();
  });

  it('validates DNS before Anthropic embed API call', async () => {
    const isSafeUrlSpy = jest.spyOn(ssrfProtection, 'isSafeUrl').mockResolvedValue(true);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: [0.1, 0.2] })
    });

    // Use unique URLs to avoid cache hits
    const uniqueBaseUrl = `https://api.anthropic.com/v1-${Date.now()}`;
    const uniqueEmbedUrl = `https://api.anthropic.com/v1-embed-${Date.now()}`;
    const adapter = await AnthropicAdapter.create({
      apiKey: 'key',
      model: 'claude-test',
      baseUrl: uniqueBaseUrl,
      resolveDns: false,
      embedding: {
        apiKey: 'key',
        baseUrl: uniqueEmbedUrl,
        model: 'embed-model'
      }
    });

    await adapter.embed('test text');

    // Should validate embedding base URL
    expect(isSafeUrlSpy).toHaveBeenCalledWith(uniqueEmbedUrl);
    expect(fetchMock).toHaveBeenCalled();
    
    isSafeUrlSpy.mockRestore();
  });

  it('validates DNS before LocalLLM generate API call', async () => {
    const isSafeUrlSpy = jest.spyOn(ssrfProtection, 'isSafeUrl').mockResolvedValue(true);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'hello', tokensUsed: 5 })
    });

    const adapter = await LocalLLMAdapter.create({
      baseUrl: 'https://llm.local',
      resolveDns: false
    });

    await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });

    expect(isSafeUrlSpy).toHaveBeenCalledWith('https://llm.local');
    expect(fetchMock).toHaveBeenCalled();
    
    isSafeUrlSpy.mockRestore();
  });

  it('caches DNS validation results', async () => {
    const isSafeUrlSpy = jest.spyOn(ssrfProtection, 'isSafeUrl').mockResolvedValue(true);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello' } }], usage: { total_tokens: 5 } })
    });

    const uniqueUrl = `https://api.openai.com/v1-cache-${Date.now()}`;
    const adapter = await OpenAIAdapter.create({
      apiKey: 'key',
      model: 'gpt-test',
      embeddingModel: 'text-embed',
      baseUrl: uniqueUrl,
      resolveDns: false
    });

    // First call
    await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });
    // Second call - should use cached validation
    await adapter.generate({ messages: [{ role: 'user', content: 'hi2' }] });

    // DNS validation should only be called once (cached on second call)
    expect(isSafeUrlSpy).toHaveBeenCalledTimes(1);
    expect(isSafeUrlSpy).toHaveBeenCalledWith(uniqueUrl);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    
    isSafeUrlSpy.mockRestore();
  });
});

