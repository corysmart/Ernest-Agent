import type { MemoryItem, MemoryType } from '../types';

export interface MemoryRepository {
  save(memory: MemoryItem): Promise<void>;
  getByIds(ids: string[]): Promise<MemoryItem[]>;
  updateAccess(id: string, accessedAt: number): Promise<void>;
  listByType(types?: MemoryType[], limit?: number): Promise<MemoryItem[]>;
  delete(id: string): Promise<void>;
}
