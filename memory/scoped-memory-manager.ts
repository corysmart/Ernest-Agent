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
    // To avoid retrieval dilution, we need to query more results than requested
    // because other scopes may dominate the top-K vector search results.
    // We query a large fixed number to ensure we get enough results for this scope
    // even when other scopes have many more memories.
    const MIN_QUERY_SIZE = 100; // Query at least 100 results to account for other scopes
    const baseLimit = query.limit ?? 5;
    const expandedLimit = Math.max(MIN_QUERY_SIZE, baseLimit * 10);
    
    const expandedQuery = {
      ...query,
      limit: expandedLimit
    };
    
    const results = await this.baseManager.query(expandedQuery);
    
    // Filter to only results in this scope and unscope the IDs
    const scopedResults = results
      .filter((result) => result.memory.id.startsWith(`${this.scope}:`))
      .map((result) => ({
        ...result,
        memory: {
          ...result.memory,
          id: this.unscopedId(result.memory.id)
        }
      }));
    
    // Return only the requested number of results
    return scopedResults.slice(0, query.limit ?? scopedResults.length);
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

