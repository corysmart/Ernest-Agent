import type { IMemoryManager } from './memory-manager';
import type { MemoryItem, MemoryQuery, MemorySearchResult } from './types';

/**
 * ScopedMemoryManager wraps a MemoryManager to enforce tenant/request isolation.
 * It prefixes memory IDs with the scope to prevent cross-contamination.
 * 
 * If `persist` is false, memories are not persisted (useful for anonymous/one-off requests
 * to prevent unbounded memory growth).
 */
export class ScopedMemoryManager implements IMemoryManager {
  constructor(
    private readonly baseManager: IMemoryManager,
    private readonly scope: string,
    private readonly persist: boolean = true
  ) {
    if (!scope || scope.includes(':')) {
      throw new Error('Scope must be non-empty and not contain colons');
    }
  }

  private scopeId(id: string): string {
    return `${this.scope}:${id}`;
  }

  private unscopedId(scopedId: string): string {
    if (!scopedId.startsWith(`${this.scope}:`)) {
      throw new Error(`Memory ID ${scopedId} does not belong to scope ${this.scope}`);
    }
    return scopedId.slice(this.scope.length + 1);
  }

  async addEpisodic(memory: MemoryItem): Promise<void> {
    if (!this.persist) {
      return; // Skip persistence for anonymous/one-off requests
    }
    const scopedMemory = {
      ...memory,
      id: this.scopeId(memory.id)
    };
    await this.baseManager.addEpisodic(scopedMemory);
  }

  async addSemantic(memory: MemoryItem): Promise<void> {
    if (!this.persist) {
      return; // Skip persistence for anonymous/one-off requests
    }
    const scopedMemory = {
      ...memory,
      id: this.scopeId(memory.id)
    };
    await this.baseManager.addSemantic(scopedMemory);
  }

  async addProcedural(memory: MemoryItem): Promise<void> {
    if (!this.persist) {
      return; // Skip persistence for anonymous/one-off requests
    }
    const scopedMemory = {
      ...memory,
      id: this.scopeId(memory.id)
    };
    await this.baseManager.addProcedural(scopedMemory);
  }

  async query(query: MemoryQuery): Promise<MemorySearchResult[]> {
    // Use scope-aware vector store filtering to guarantee tenant-local recall.
    // This prevents dilution even under heavy cross-tenant load by filtering
    // at the vector store level before top-K selection.
    const scopedQuery = {
      ...query,
      scope: this.scope
    };
    
    const results = await this.baseManager.query(scopedQuery);
    
    // Unscope the IDs (they're already filtered by scope at vector store level)
    return results.map((result) => ({
      ...result,
      memory: {
        ...result.memory,
        id: this.unscopedId(result.memory.id)
      }
    }));
  }

  async injectForPrompt(query: MemoryQuery): Promise<string> {
    const results = await this.query(query);
    if (!results.length) {
      return '';
    }

    return results
      .map((result) => `[${result.memory.type}] ${result.memory.content}`)
      .join('\n');
  }
}

