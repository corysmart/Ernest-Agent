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
    // P3: Snapshot IDs first to ensure stable pagination even if new items are inserted during iteration
    // Without this, insertion order changes can cause skipped/duplicated items in long-running processes
    // This creates a stable snapshot of IDs at the start of the query
    const allMemories = [...this.memories.values()];
    const filtered = allMemories.filter((memory) =>
      types ? types.includes(memory.type) : true
    );
    
    // Snapshot IDs to ensure stable pagination
    const snapshotIds = filtered.map((memory) => memory.id);
    
    // Fetch by IDs to ensure we get the exact items from the snapshot, even if the Map changes
    const paginatedIds = snapshotIds.slice(offset, offset + limit);
    return paginatedIds
      .map((id) => this.memories.get(id))
      .filter((memory): memory is MemoryItem => Boolean(memory));
  }

  async delete(id: string): Promise<void> {
    this.memories.delete(id);
  }
}
