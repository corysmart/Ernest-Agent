import { AzureOpenAIAdapter } from '../../llm/adapters/azure-openai-adapter';
import * as ssrfProtection from '../../security/ssrf-protection';

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (global as any).fetch = fetchMock;
  jest.spyOn(ssrfProtection, 'isSafeUrl').mockResolvedValue(true);
});

describe('AzureOpenAIAdapter', () => {
  const baseOptions = {
    apiKey: 'azure-key',
    endpoint: 'https://my-resource.openai.azure.com',
    deployment: 'gpt-4o-mini',
    embeddingDeployment: 'text-embedding-3-small',
    resolveDns: false
  };

  it('calls Azure chat completions endpoint with api-key header', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello' } }], usage: { total_tokens: 5 } })
    });

    const adapter = await AzureOpenAIAdapter.create(baseOptions);
    const result = await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.content).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://my-resource.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21'
    );
    expect(init.headers).toEqual({
      'api-key': 'azure-key',
      'Content-Type': 'application/json'
    });
  });

  it('uses custom api version when provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] })
    });

    const adapter = await AzureOpenAIAdapter.create({
      ...baseOptions,
      apiVersion: '2024-08-01-preview'
    });
    await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('api-version=2024-08-01-preview');
  });

  it('normalizes endpoint with trailing slash and /openai suffix', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] })
    });

    const adapter = await AzureOpenAIAdapter.create({
      ...baseOptions,
      endpoint: 'https://my-resource.openai.azure.com/openai/'
    });
    await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      'https://my-resource.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21'
    );
  });

  it('rejects unsafe endpoint', async () => {
    await expect(AzureOpenAIAdapter.create({
      ...baseOptions,
      endpoint: 'http://127.0.0.1'
    })).rejects.toThrow('Unsafe Azure OpenAI endpoint');
  });

  it('fetches embeddings from embedding deployment', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2] }] })
    });

    const adapter = await AzureOpenAIAdapter.create(baseOptions);
    const embedding = await adapter.embed('text');

    expect(embedding).toEqual([0.1, 0.2]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      'https://my-resource.openai.azure.com/openai/deployments/text-embedding-3-small/embeddings?api-version=2024-10-21'
    );
  });
});
