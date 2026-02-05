import { InMemoryMemoryRepository } from '../../memory/repositories/in-memory-memory-repository';
import type { EpisodicMemory } from '../../memory/types';

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
});
