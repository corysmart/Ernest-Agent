import { MemoryManager } from '../../memory/memory-manager';
import { InMemoryMemoryRepository } from '../../memory/repositories/in-memory-memory-repository';
import { LocalVectorStore } from '../../memory/vector/local-vector-store';
import { MockLLMAdapter } from '../../llm/mock-adapter';

describe('Integration: memory retrieval loop', () => {
  it('stores and retrieves relevant memories end-to-end', async () => {
    const repository = new InMemoryMemoryRepository();
    const vectorStore = new LocalVectorStore();
    const adapter = new MockLLMAdapter({ embeddingSize: 4 });
    const manager = new MemoryManager({
      repository,
      vectorStore,
      embeddingProvider: { embed: adapter.embed.bind(adapter) }
    });

    await manager.addSemantic({
      id: 'm1',
      type: 'semantic',
      content: 'System stabilized after restart',
      createdAt: Date.now(),
      factConfidence: 0.9
    });

    await manager.addEpisodic({
      id: 'm2',
      type: 'episodic',
      content: 'Observed high latency',
      createdAt: Date.now(),
      eventType: 'observation'
    });

    const results = await manager.query({ text: 'stabilized', limit: 1 });
    expect(results[0].memory.id).toBe('m1');
  });
});
