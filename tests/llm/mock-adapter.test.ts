import { MockLLMAdapter } from '../../llm/mock-adapter';

describe('MockLLMAdapter', () => {
  it('returns configured response', async () => {
    const adapter = new MockLLMAdapter({ response: 'ok', costPerToken: 0.002 });
    const result = await adapter.generate({ messages: [{ role: 'user', content: 'Hello' }] });

    expect(result.content).toBe('ok');
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it('returns deterministic embeddings', async () => {
    const adapter = new MockLLMAdapter({ embeddingSize: 6 });
    const embedding = await adapter.embed('sample');

    expect(embedding).toHaveLength(6);
    expect(embedding.every((value) => typeof value === 'number')).toBe(true);
  });

  it('estimates cost based on tokens', () => {
    const adapter = new MockLLMAdapter({ costPerToken: 0.01 });
    expect(adapter.estimateCost(100)).toBeCloseTo(1);
  });

  it('rejects empty prompts', async () => {
    const adapter = new MockLLMAdapter();

    await expect(adapter.generate({ messages: [] })).rejects.toThrow('Prompt messages are required');
  });

  it('guards against maliciously large inputs', async () => {
    const adapter = new MockLLMAdapter({ maxInputLength: 10 });
    const longText = 'a'.repeat(50);

    await expect(
      adapter.generate({ messages: [{ role: 'user', content: longText }] })
    ).rejects.toThrow('Prompt exceeds maximum length');
  });
});
