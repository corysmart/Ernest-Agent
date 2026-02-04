import { ScopedMemoryManager } from '../../memory/scoped-memory-manager';
import { MemoryManager } from '../../memory/memory-manager';
import { InMemoryMemoryRepository } from '../../memory/repositories/in-memory-memory-repository';
import { LocalVectorStore } from '../../memory/vector/local-vector-store';
import { MockLLMAdapter } from '../../llm/mock-adapter';

describe('Scoped Memory Retrieval Quality', () => {
  it('prevents retrieval dilution when other scopes dominate vector search', async () => {
    // Create a base memory manager shared across scopes
    const repository = new InMemoryMemoryRepository();
    const vectorStore = new LocalVectorStore();
    const embeddingProvider = new MockLLMAdapter();
    
    const baseManager = new MemoryManager({
      repository,
      vectorStore,
      embeddingProvider
    });

    // Create two scoped managers
    const scopeAManager = new ScopedMemoryManager(baseManager, 'scope-a');
    const scopeBManager = new ScopedMemoryManager(baseManager, 'scope-b');

    // Store many memories in scope B (they will be more similar to query)
    for (let i = 0; i < 20; i++) {
      await scopeBManager.addEpisodic({
        id: `memory-b-${i}`,
        type: 'episodic',
        content: `Scope B memory ${i} about test topic`,
        createdAt: Date.now(),
        eventType: 'observation'
      });
    }

    // Store a few memories in scope A (same topic, but fewer)
    for (let i = 0; i < 3; i++) {
      await scopeAManager.addEpisodic({
        id: `memory-a-${i}`,
        type: 'episodic',
        content: `Scope A memory ${i} about test topic`,
        createdAt: Date.now(),
        eventType: 'observation'
      });
    }

    // Query scope A - should get its own memories despite scope B dominating vector search
    const results = await scopeAManager.query({
      text: 'test topic',
      limit: 3
    });

    // Should get all 3 scope A memories (not diluted by scope B)
    expect(results.length).toBe(3);
    expect(results.every((r) => r.memory.id.startsWith('memory-a-'))).toBe(true);
    expect(results.some((r) => r.memory.id === 'memory-a-0')).toBe(true);
    expect(results.some((r) => r.memory.id === 'memory-a-1')).toBe(true);
    expect(results.some((r) => r.memory.id === 'memory-a-2')).toBe(true);
  });

  it('returns requested number of results when scope has enough memories', async () => {
    const repository = new InMemoryMemoryRepository();
    const vectorStore = new LocalVectorStore();
    const embeddingProvider = new MockLLMAdapter();
    
    const baseManager = new MemoryManager({
      repository,
      vectorStore,
      embeddingProvider
    });

    const scopeManager = new ScopedMemoryManager(baseManager, 'scope-1');

    // Store 10 memories
    for (let i = 0; i < 10; i++) {
      await scopeManager.addEpisodic({
        id: `memory-${i}`,
        type: 'episodic',
        content: `Memory ${i} about topic`,
        createdAt: Date.now(),
        eventType: 'observation'
      });
    }

    // Query for 5 results
    const results = await scopeManager.query({
      text: 'topic',
      limit: 5
    });

    // Should get exactly 5 results
    expect(results.length).toBe(5);
  });

  it('handles case where other scopes completely dominate top-K results', async () => {
    const repository = new InMemoryMemoryRepository();
    const vectorStore = new LocalVectorStore();
    const embeddingProvider = new MockLLMAdapter();
    
    const baseManager = new MemoryManager({
      repository,
      vectorStore,
      embeddingProvider
    });

    const scopeAManager = new ScopedMemoryManager(baseManager, 'scope-a');
    const scopeBManager = new ScopedMemoryManager(baseManager, 'scope-b');

    // Store 1 memory in scope A
    await scopeAManager.addEpisodic({
      id: 'memory-a',
      type: 'episodic',
      content: 'Scope A memory about topic',
      createdAt: Date.now(),
      eventType: 'observation'
    });

    // Store 50 memories in scope B (will dominate vector search)
    for (let i = 0; i < 50; i++) {
      await scopeBManager.addEpisodic({
        id: `memory-b-${i}`,
        type: 'episodic',
        content: `Scope B memory ${i} about topic`,
        createdAt: Date.now(),
        eventType: 'observation'
      });
    }

    // Query scope A with limit 1
    const results = await scopeAManager.query({
      text: 'topic',
      limit: 1
    });

    // Should still get scope A's memory despite scope B dominating
    // The expanded query ensures we query enough results to find scope A's memory
    expect(results.length).toBe(1);
    expect(results[0]!.memory.id).toBe('memory-a');
  });
});
