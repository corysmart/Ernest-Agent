import { LocalLLMAdapter } from '../../llm/adapters/local-adapter';
import * as ssrfProtection from '../../security/ssrf-protection';

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (global as any).fetch = fetchMock;
  // Mock DNS validation to always pass in tests
  jest.spyOn(ssrfProtection, 'isSafeUrl').mockResolvedValue(true);
});

describe('LocalLLMAdapter', () => {
  it('calls local generate endpoint', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'ok', tokensUsed: 5 })
    });

    const adapter = await LocalLLMAdapter.create({ baseUrl: 'https://llm.local', resolveDns: false });
    const result = await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.content).toBe('ok');
  });

  it('rejects unsafe base URL', async () => {
    await expect(LocalLLMAdapter.create({ baseUrl: 'http://127.0.0.1', resolveDns: false })).rejects.toThrow('Unsafe local model URL');
  });

  it('fetches embeddings', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: [0.3, 0.4] })
    });

    const adapter = await LocalLLMAdapter.create({ baseUrl: 'https://llm.local', resolveDns: false });
    const embedding = await adapter.embed('text');

    expect(embedding).toEqual([0.3, 0.4]);
  });
});
