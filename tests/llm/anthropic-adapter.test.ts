import { AnthropicAdapter } from '../../llm/adapters/anthropic-adapter';
import * as ssrfProtection from '../../security/ssrf-protection';

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (global as any).fetch = fetchMock;
  // Mock DNS validation to always pass in tests
  jest.spyOn(ssrfProtection, 'isSafeUrl').mockResolvedValue(true);
});

describe('AnthropicAdapter', () => {
  it('calls messages endpoint and parses content', async () => {
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

    const result = await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result.content).toBe('hello');
  });

  it('rejects unsafe base URL', async () => {
    await expect(AnthropicAdapter.create({
      apiKey: 'key',
      model: 'claude-test',
      baseUrl: 'http://127.0.0.1',
      resolveDns: false
    })).rejects.toThrow('Unsafe Anthropic base URL');
  });

  it('rejects embedding when not configured', async () => {
    const adapter = await AnthropicAdapter.create({ apiKey: 'key', model: 'claude-test', baseUrl: 'https://api.anthropic.com/v1', resolveDns: false });
    await expect(adapter.embed('text')).rejects.toThrow('Anthropic embeddings not configured');
  });
});
