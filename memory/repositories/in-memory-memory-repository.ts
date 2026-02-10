import type { MemoryItem, MemoryType } from '../types';
import type { MemoryRepository } from './memory-repository';

export class InMemoryMemoryRepository implements MemoryRepository {
  private readonly memories = new Map<string, MemoryItem>();

  async save(memory: MemoryItem): Promise<void> {
    // P3: Align behavior with Postgres repository - use upsert instead of throwing on duplicates
    // This prevents test/prod behavioral drift where tests fail fast but prod overwrites
    this.memories.set(memory.id, { ...memory });
  }

  async getByIds(ids: string[]): Promise<MemoryItem[]> {
    return ids
      .map((id) => this.memories.get(id))
      .filter((memory): memory is MemoryItem => Boolean(memory));
  }

  async updateAccess(id: string, accessedAt: number): Promise<void> {
    const memory = this.memories.get(id);
    if (!memory) {
      return;
    }

    this.memories.set(id, { ...memory, lastAccessedAt: accessedAt });
  }

  async listByType(types?: MemoryType[], limit: number = 50, offset: number = 0): Promise<MemoryItem[]> {
    const filtered = [...this.memories.values()].filter((memory) =>
      types ? types.includes(memory.type) : true
    );

    return filtered.slice(offset, offset + limit);
  }

  async delete(id: string): Promise<void> {
    this.memories.delete(id);
  }
}
