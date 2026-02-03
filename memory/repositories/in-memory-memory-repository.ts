import type { MemoryItem, MemoryType } from '../types';
import type { MemoryRepository } from './memory-repository';

export class InMemoryMemoryRepository implements MemoryRepository {
  private readonly memories = new Map<string, MemoryItem>();

  async save(memory: MemoryItem): Promise<void> {
    if (this.memories.has(memory.id)) {
      throw new Error('Memory with id already exists');
    }

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

  async listByType(types?: MemoryType[], limit: number = 50): Promise<MemoryItem[]> {
    const filtered = [...this.memories.values()].filter((memory) =>
      types ? types.includes(memory.type) : true
    );

    return filtered.slice(0, limit);
  }

  async delete(id: string): Promise<void> {
    this.memories.delete(id);
  }
}
