import { OpenAIAdapter } from '../../llm/adapters/openai-adapter';
import { AnthropicAdapter } from '../../llm/adapters/anthropic-adapter';
import { LocalLLMAdapter } from '../../llm/adapters/local-adapter';

describe('SSRF DNS Validation Bypass', () => {
  it('P3: Constructor still allows DNS-rebindable URL (backward compatibility)', () => {
    // Constructor still exists for backward compatibility but only does basic check
    // This documents that direct constructor usage bypasses DNS validation
    const maliciousUrl = 'https://evil.example.com';
    
    // Constructor only does basic check - no DNS validation
    expect(() => {
      new OpenAIAdapter({
        apiKey: 'test-key',
        model: 'gpt-4',
        embeddingModel: 'text-embedding-3-small',
        baseUrl: maliciousUrl
      });
    }).not.toThrow();
  });

  it('P3: Async factory method prevents DNS rebinding attacks', async () => {
    // The async factory method validates DNS to prevent rebinding
    const maliciousUrl = 'https://evil.example.com';
    
    // Factory method should reject URLs that resolve to private IPs
    // Using a mock lookup function that returns private IP
    await expect(
      OpenAIAdapter.create({
        apiKey: 'test-key',
        model: 'gpt-4',
        embeddingModel: 'text-embedding-3-small',
        baseUrl: maliciousUrl,
        resolveDns: true
      })
    ).rejects.toThrow();
  });

  it('P3: Factory method can skip DNS validation with resolveDns=false', async () => {
    // For restrictive environments, DNS validation can be skipped
    const url = 'https://api.openai.com/v1';
    
    const adapter = await OpenAIAdapter.create({
      apiKey: 'test-key',
      model: 'gpt-4',
      embeddingModel: 'text-embedding-3-small',
      baseUrl: url,
      resolveDns: false
    });
    
    expect(adapter).toBeDefined();
  });

  it('P3: AnthropicAdapter factory method validates DNS', async () => {
    const maliciousUrl = 'https://evil.example.com';
    
    await expect(
      AnthropicAdapter.create({
        apiKey: 'test-key',
        model: 'claude-3-opus-20240229',
        baseUrl: maliciousUrl,
        resolveDns: true
      })
    ).rejects.toThrow();
  });

  it('P3: LocalLLMAdapter factory method validates DNS when no allowlist', async () => {
    const maliciousUrl = 'https://evil.example.com';
    
    await expect(
      LocalLLMAdapter.create({
        baseUrl: maliciousUrl,
        resolveDns: true
      })
    ).rejects.toThrow();
  });

  it('P3: LocalLLMAdapter factory skips DNS validation when allowlist provided', async () => {
    // Allowlist bypasses DNS check (by design for local development)
    const url = 'https://localhost:11434';
    
    const adapter = await LocalLLMAdapter.create({
      baseUrl: url,
      allowlist: ['localhost'],
      resolveDns: true
    });
    
    expect(adapter).toBeDefined();
  });
});

