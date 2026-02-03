import { OpenAIAdapter } from '../../llm/adapters/openai-adapter';

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (global as any).fetch = fetchMock;
});

describe('OpenAIAdapter', () => {
  it('calls chat completions endpoint', async () => {
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

    const result = await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.content).toBe('hello');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('rejects unsafe base URL', () => {
    expect(() => new OpenAIAdapter({
      apiKey: 'key',
      model: 'gpt-test',
      embeddingModel: 'text-embed',
      baseUrl: 'http://127.0.0.1'
    })).toThrow('Unsafe OpenAI base URL');
  });

  it('fetches embeddings', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2] }] })
    });

    const adapter = new OpenAIAdapter({
      apiKey: 'key',
      model: 'gpt-test',
      embeddingModel: 'text-embed',
      baseUrl: 'https://api.openai.com/v1'
    });

    const embedding = await adapter.embed('text');
    expect(embedding).toEqual([0.1, 0.2]);
  });
});
