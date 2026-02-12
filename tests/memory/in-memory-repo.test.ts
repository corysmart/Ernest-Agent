import { InMemoryMemoryRepository } from '../../memory/repositories/in-memory-memory-repository';
import type { EpisodicMemory, SemanticMemory } from '../../memory/types';

describe('InMemoryMemoryRepository', () => {
  it('stores and retrieves memories', async () => {
    const repo = new InMemoryMemoryRepository();
    const memory: EpisodicMemory = {
      id: 'm1',
      type: 'episodic',
      content: 'Agent observed event',
      createdAt: Date.now(),
      eventType: 'observation'
    };

    await repo.save(memory);
    const results = await repo.getByIds(['m1']);

    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe('Agent observed event');
  });

  it('updates access timestamp', async () => {
    const repo = new InMemoryMemoryRepository();
    const now = Date.now();
    const memory: EpisodicMemory = {
      id: 'm2',
      type: 'episodic',
      content: 'Test',
      createdAt: now,
      eventType: 'observation'
    };

    await repo.save(memory);
    await repo.updateAccess('m2', now + 1000);

    const [stored] = await repo.getByIds(['m2']);
    expect(stored?.lastAccessedAt).toBe(now + 1000);
  });

  it('returns empty array for unknown ids', async () => {
    const repo = new InMemoryMemoryRepository();
    const results = await repo.getByIds(['missing']);

    expect(results).toHaveLength(0);
  });

  it('P3: upserts duplicate ids to align with Postgres repository behavior', async () => {
    const repo = new InMemoryMemoryRepository();
    const memory: EpisodicMemory = {
      id: 'dup',
      type: 'episodic',
      content: 'First',
      createdAt: Date.now(),
      eventType: 'observation'
    };

    await repo.save(memory);

    // P3: Should upsert (update) instead of throwing, matching Postgres behavior
    await expect(repo.save({ ...memory, content: 'Second' })).resolves.not.toThrow();
    
    // Verify the memory was updated
    const results = await repo.getByIds(['dup']);
    expect(results).toHaveLength(1);
    expect(results[0]!.content).toBe('Second');
  });

  it('listByType filters by types', async () => {
    const repo = new InMemoryMemoryRepository();
    const episodic: EpisodicMemory = {
      id: 'e1',
      type: 'episodic',
      content: 'Ep',
      createdAt: Date.now(),
      eventType: 'observation'
    };
    const semantic: SemanticMemory = {
      id: 's1',
      type: 'semantic',
      content: 'Se',
      createdAt: Date.now(),
      factConfidence: 0.9
    };
    await repo.save(episodic);
    await repo.save(semantic);

    const episodicOnly = await repo.listByType(['episodic']);
    expect(episodicOnly).toHaveLength(1);
    expect(episodicOnly[0]!.type).toBe('episodic');

    const semanticOnly = await repo.listByType(['semantic']);
    expect(semanticOnly).toHaveLength(1);
    expect(semanticOnly[0]!.type).toBe('semantic');
  });

  it('listByType respects limit and offset', async () => {
    const repo = new InMemoryMemoryRepository();
    for (let i = 0; i < 5; i++) {
      await repo.save({
        id: `m${i}`,
        type: 'episodic',
        content: `Mem ${i}`,
        createdAt: Date.now(),
        eventType: 'observation'
      });
    }

    const page1 = await repo.listByType(undefined, 2, 0);
    expect(page1).toHaveLength(2);

    const page2 = await repo.listByType(undefined, 2, 2);
    expect(page2).toHaveLength(2);
  });

  it('updateAccess is no-op for missing id', async () => {
    const repo = new InMemoryMemoryRepository();
    await expect(repo.updateAccess('nonexistent', Date.now())).resolves.not.toThrow();
  });

  it('delete removes memory', async () => {
    const repo = new InMemoryMemoryRepository();
    const m: EpisodicMemory = {
      id: 'd1',
      type: 'episodic',
      content: 'To delete',
      createdAt: Date.now(),
      eventType: 'observation'
    };
    await repo.save(m);
    await repo.delete('d1');
    const results = await repo.getByIds(['d1']);
    expect(results).toHaveLength(0);
  });
});
