import type { IMemoryManager } from './memory-manager';
import type { MemoryItem, MemoryQuery, MemorySearchResult } from './types';

/**
 * ScopedMemoryManager wraps a MemoryManager to enforce tenant/request isolation.
 * It prefixes memory IDs with the scope to prevent cross-contamination.
 */
export class ScopedMemoryManager implements IMemoryManager {
  constructor(
    private readonly baseManager: IMemoryManager,
    private readonly scope: string
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
    const scopedMemory = {
      ...memory,
      id: this.scopeId(memory.id)
    };
    await this.baseManager.addEpisodic(scopedMemory);
  }

  async addSemantic(memory: MemoryItem): Promise<void> {
    const scopedMemory = {
      ...memory,
      id: this.scopeId(memory.id)
    };
    await this.baseManager.addSemantic(scopedMemory);
  }

  async addProcedural(memory: MemoryItem): Promise<void> {
    const scopedMemory = {
      ...memory,
      id: this.scopeId(memory.id)
    };
    await this.baseManager.addProcedural(scopedMemory);
  }

  async query(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const results = await this.baseManager.query(query);
    
    // Filter to only results in this scope and unscope the IDs
    return results
      .filter((result) => result.memory.id.startsWith(`${this.scope}:`))
      .map((result) => ({
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

