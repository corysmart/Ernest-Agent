import { buildContainer } from '../../server/container';
import * as ssrfProtection from '../../security/ssrf-protection';

describe('DNS Dependency in Container', () => {
  let isSafeUrlSpy: jest.SpyInstance;

  beforeEach(() => {
    // Clear environment
    delete process.env.LLM_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.LOCAL_LLM_URL;
    delete process.env.SSRF_RESOLVE_DNS;
    
    // Mock DNS validation to avoid real network calls in tests
    // This makes tests deterministic and work offline
    isSafeUrlSpy = jest.spyOn(ssrfProtection, 'isSafeUrl').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('P1: buildContainer works offline when DNS is mocked', async () => {
    // Mock DNS to avoid real network calls - makes test deterministic and offline-safe
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-4';
    process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
    
    // With mocked DNS, this should work offline
    const container = await buildContainer();
    expect(container).toBeDefined();
    
    // Verify DNS validation was called (but mocked, so no real network request)
    expect(isSafeUrlSpy).toHaveBeenCalled();
  });

  it('P3: buildContainer supports resolveDns=false option to skip DNS resolution', async () => {
    // After fix: should be able to skip DNS resolution via environment variable
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-4';
    process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
    process.env.SSRF_RESOLVE_DNS = 'false';
    
    // After fix: this should work without DNS resolution
    const container = await buildContainer({ resolveDns: false });
    expect(container).toBeDefined();
  });

  it('P3: buildContainer supports resolveDns via options parameter', async () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-4';
    process.env.OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
    
    // Can pass resolveDns option directly
    const container = await buildContainer({ resolveDns: false });
    expect(container).toBeDefined();
  });

  it('P3: buildContainer handles DNS lookup failures with resolveDns=false', async () => {
    process.env.LLM_PROVIDER = 'local';
    process.env.LOCAL_LLM_URL = 'https://nonexistent-domain-that-will-fail-dns-12345.invalid';
    
    // With resolveDns=false, should work even if DNS would fail
    const container = await buildContainer({ resolveDns: false });
    expect(container).toBeDefined();
  });

  it('P3: buildContainer fails DNS lookup when resolveDns=true and DNS fails', async () => {
    process.env.LLM_PROVIDER = 'local';
    process.env.LOCAL_LLM_URL = 'https://nonexistent-domain-that-will-fail-dns-12345.invalid';
    
    // Mock DNS to fail (simulating offline/restrictive environment)
    isSafeUrlSpy.mockResolvedValueOnce(false);
    
    // With resolveDns=true (default), DNS failure should cause error
    await expect(buildContainer({ resolveDns: true })).rejects.toThrow();
  });
});

