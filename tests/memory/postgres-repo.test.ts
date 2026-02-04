import { newDb } from 'pg-mem';
import { PostgresMemoryRepository } from '../../memory/repositories/postgres-memory-repository';
import type { SemanticMemory } from '../../memory/types';

describe('PostgresMemoryRepository', () => {
  it('persists and retrieves memories', async () => {
    const db = newDb();
    const pg = db.adapters.createPg();
    const pool = new pg.Pool();
    const repo = new PostgresMemoryRepository(pool);
    await repo.ensureSchema();

    const memory: SemanticMemory = {
      id: 's1',
      type: 'semantic',
      content: 'Earth is round',
      createdAt: Date.now(),
      factConfidence: 0.9
    };

    await repo.save(memory);
    const results = await repo.getByIds(['s1']);

    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe('semantic');
    expect((results[0]! as SemanticMemory).factConfidence).toBeCloseTo(0.9);
  });

  it('handles content with quotes safely', async () => {
    const db = newDb();
    const pg = db.adapters.createPg();
    const pool = new pg.Pool();
    const repo = new PostgresMemoryRepository(pool);
    await repo.ensureSchema();

    const memory: SemanticMemory = {
      id: 's2',
      type: 'semantic',
      content: "O'Reilly publishes books",
      createdAt: Date.now(),
      factConfidence: 0.8
    };

    await repo.save(memory);
    const results = await repo.getByIds(['s2']);

    expect(results[0]!.content).toContain("O'Reilly");
  });

  it('returns empty results when ids are missing', async () => {
    const db = newDb();
    const pg = db.adapters.createPg();
    const pool = new pg.Pool();
    const repo = new PostgresMemoryRepository(pool);
    await repo.ensureSchema();

    const results = await repo.getByIds(['missing']);

    expect(results).toHaveLength(0);
  });
});
