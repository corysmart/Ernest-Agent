import { OpenAIAdapter } from '../../llm/adapters/openai-adapter';
import { AnthropicAdapter } from '../../llm/adapters/anthropic-adapter';
import { LocalLLMAdapter } from '../../llm/adapters/local-adapter';

describe('Constructor Bypass Protection', () => {
  it('prevents direct constructor usage - OpenAIAdapter', () => {
    // Constructor is now private, so direct instantiation should fail
    expect(() => {
      // @ts-expect-error - Testing that private constructor cannot be called
      new OpenAIAdapter({
        apiKey: 'key',
        model: 'gpt-test',
        embeddingModel: 'text-embed',
        baseUrl: 'https://api.openai.com/v1'
      });
    }).toThrow();
  });

  it('prevents direct constructor usage - AnthropicAdapter', () => {
    // Constructor is now private, so direct instantiation should fail
    expect(() => {
      // @ts-expect-error - Testing that private constructor cannot be called
      new AnthropicAdapter({
        apiKey: 'key',
        model: 'claude-test',
        baseUrl: 'https://api.anthropic.com/v1'
      });
    }).toThrow();
  });

  it('prevents direct constructor usage - LocalLLMAdapter', () => {
    // Constructor is now private, so direct instantiation should fail
    expect(() => {
      // @ts-expect-error - Testing that private constructor cannot be called
      new LocalLLMAdapter({
        baseUrl: 'https://localhost:11434',
        allowlist: ['localhost']
      });
    }).toThrow();
  });

  it('requires factory method for instantiation', async () => {
    // Factory method should work
    const adapter = await OpenAIAdapter.create({
      apiKey: 'key',
      model: 'gpt-test',
      embeddingModel: 'text-embed',
      baseUrl: 'https://api.openai.com/v1',
      resolveDns: false
    });

    expect(adapter).toBeDefined();
  });
});

