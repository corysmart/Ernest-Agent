import { InMemoryMemoryRepository } from '../../memory/repositories/in-memory-memory-repository';

describe('InMemoryMemoryRepository - Upsert Behavior', () => {
  it('P3: upserts memory instead of throwing on duplicate IDs', async () => {
    const repo = new InMemoryMemoryRepository();
    const memory1 = {
      id: 'test-id',
      type: 'episodic' as const,
      content: 'Original content',
      createdAt: Date.now(),
      eventType: 'observation' as const
    };

    const memory2 = {
      id: 'test-id',
      type: 'episodic' as const,
      content: 'Updated content',
      createdAt: Date.now() + 1000,
      eventType: 'action' as const
    };

    // First save should succeed
    await repo.save(memory1);
    
    // Second save with same ID should upsert (not throw)
    await expect(repo.save(memory2)).resolves.not.toThrow();

    // Verify the memory was updated
    const retrieved = await repo.getByIds(['test-id']);
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0]!.content).toBe('Updated content');
    // Type guard to check if it's episodic memory
    if (retrieved[0]!.type === 'episodic') {
      expect(retrieved[0]!.eventType).toBe('action');
    }
  });

  it('P3: aligns behavior with Postgres repository (upsert)', async () => {
    const repo = new InMemoryMemoryRepository();
    const memory = {
      id: 'duplicate-id',
      type: 'semantic' as const,
      content: 'First version',
      createdAt: Date.now(),
      factConfidence: 0.8
    };

    await repo.save(memory);

    // Update the same memory
    const updatedMemory = {
      ...memory,
      content: 'Second version',
      factConfidence: 0.9
    };

    // Should upsert without throwing
    await expect(repo.save(updatedMemory)).resolves.not.toThrow();

    const retrieved = await repo.getByIds(['duplicate-id']);
    expect(retrieved[0]!.content).toBe('Second version');
    // Type guard to check if it's semantic memory
    if (retrieved[0]!.type === 'semantic') {
      expect(retrieved[0]!.factConfidence).toBe(0.9);
    }
  });

  it('creates new memory when ID does not exist', async () => {
    const repo = new InMemoryMemoryRepository();
    const memory = {
      id: 'new-id',
      type: 'episodic' as const,
      content: 'New memory',
      createdAt: Date.now(),
      eventType: 'observation' as const
    };

    await repo.save(memory);

    const retrieved = await repo.getByIds(['new-id']);
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0]!.content).toBe('New memory');
  });
});

