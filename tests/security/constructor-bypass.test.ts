import { OpenAIAdapter } from '../../llm/adapters/openai-adapter';
import { AnthropicAdapter } from '../../llm/adapters/anthropic-adapter';
import { LocalLLMAdapter } from '../../llm/adapters/local-adapter';

describe('Constructor Bypass Protection', () => {
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('warns when OpenAIAdapter constructor is used directly', () => {
    new OpenAIAdapter({
      apiKey: 'key',
      model: 'gpt-test',
      embeddingModel: 'text-embed',
      baseUrl: 'https://api.openai.com/v1'
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('OpenAIAdapter: Direct constructor usage bypasses DNS rebinding protection')
    );
  });

  it('warns when AnthropicAdapter constructor is used directly', () => {
    new AnthropicAdapter({
      apiKey: 'key',
      model: 'claude-test',
      baseUrl: 'https://api.anthropic.com/v1'
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('AnthropicAdapter: Direct constructor usage bypasses DNS rebinding protection')
    );
  });

  it('warns when LocalLLMAdapter constructor is used directly', () => {
    new LocalLLMAdapter({
      baseUrl: 'https://localhost:11434',
      allowlist: ['localhost']
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('LocalLLMAdapter: Direct constructor usage bypasses DNS rebinding protection')
    );
  });

  it('allows constructor usage but warns about security risk', () => {
    // Constructor should still work for backward compatibility
    const adapter = new OpenAIAdapter({
      apiKey: 'key',
      model: 'gpt-test',
      embeddingModel: 'text-embed',
      baseUrl: 'https://api.openai.com/v1'
    });

    expect(adapter).toBeDefined();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });
});

