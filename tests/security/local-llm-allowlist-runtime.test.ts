import { LocalLLMAdapter } from '../../llm/adapters/local-adapter';
import * as ssrfProtection from '../../security/ssrf-protection';

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (global as any).fetch = fetchMock;
  // Mock DNS validation to fail (simulating private IP)
  jest.spyOn(ssrfProtection, 'isSafeUrl').mockResolvedValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LocalLLM Allowlist Runtime Validation', () => {
  it('respects allowlist during generate() API call', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'hello', tokensUsed: 5 })
    });

    // Create adapter with allowlist for localhost
    const adapter = await LocalLLMAdapter.create({
      baseUrl: 'https://localhost:11434',
      allowlist: ['localhost'],
      resolveDns: true
    });

    // Should succeed even though DNS would fail (allowlist bypasses DNS check)
    const result = await adapter.generate({ messages: [{ role: 'user', content: 'hi' }] });

    expect(result.content).toBe('hello');
    expect(fetchMock).toHaveBeenCalled();
    
    // DNS validation should not be called because allowlist is present
    expect(ssrfProtection.isSafeUrl).not.toHaveBeenCalled();
  });

  it('respects allowlist during embed() API call', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: [0.1, 0.2] })
    });

    // Create adapter with allowlist for localhost
    const adapter = await LocalLLMAdapter.create({
      baseUrl: 'https://localhost:11434',
      allowlist: ['localhost'],
      resolveDns: true
    });

    // Should succeed even though DNS would fail (allowlist bypasses DNS check)
    const embedding = await adapter.embed('test text');

    expect(embedding).toEqual([0.1, 0.2]);
    expect(fetchMock).toHaveBeenCalled();
    
    // DNS validation should not be called because allowlist is present
    expect(ssrfProtection.isSafeUrl).not.toHaveBeenCalled();
  });

  it('performs DNS validation when no allowlist is provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'hello', tokensUsed: 5 })
    });

    // Create adapter without allowlist
    const adapter = await LocalLLMAdapter.create({
      baseUrl: 'https://api.example.com',
      resolveDns: false // Skip DNS during create, but it will be checked during API calls
    });

    // Should fail because DNS validation fails (no allowlist to bypass)
    await expect(
      adapter.generate({ messages: [{ role: 'user', content: 'hi' }] })
    ).rejects.toThrow('Unsafe URL detected');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(ssrfProtection.isSafeUrl).toHaveBeenCalled();
  });
});
