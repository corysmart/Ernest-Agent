import { aggregateScore, goalRelevanceScore, timeDecayScore } from './scoring';
import type { MemoryRepository } from './repositories/memory-repository';
import type { MemoryItem, MemoryQuery, MemorySearchResult } from './types';
import type { VectorStore } from './vector/vector-store';

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export interface MemoryPoisoningGuard {
  assess(content: string): { allowed: boolean; reasons: string[] };
}

export interface IMemoryManager {
  addEpisodic(memory: MemoryItem): Promise<void>;
  addSemantic(memory: MemoryItem): Promise<void>;
  addProcedural(memory: MemoryItem): Promise<void>;
  query(query: MemoryQuery): Promise<MemorySearchResult[]>;
  injectForPrompt(query: MemoryQuery): Promise<string>;
}

interface MemoryManagerOptions {
  repository: MemoryRepository;
  vectorStore: VectorStore;
  embeddingProvider: EmbeddingProvider;
  poisoningGuard?: MemoryPoisoningGuard;
  halfLifeMs?: number;
}

export class MemoryManager implements IMemoryManager {
  private readonly repository: MemoryRepository;
  private readonly vectorStore: VectorStore;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly poisoningGuard?: MemoryPoisoningGuard;
  private readonly halfLifeMs: number;

  constructor(options: MemoryManagerOptions) {
    this.repository = options.repository;
    this.vectorStore = options.vectorStore;
    this.embeddingProvider = options.embeddingProvider;
    this.poisoningGuard = options.poisoningGuard;
    this.halfLifeMs = options.halfLifeMs ?? 7 * 24 * 60 * 60 * 1000;
  }

  async addEpisodic(memory: MemoryItem): Promise<void> {
    if (memory.type !== 'episodic') {
      throw new Error('Episodic memory type required');
    }
    await this.store(memory);
  }

  async addSemantic(memory: MemoryItem): Promise<void> {
    if (memory.type !== 'semantic') {
      throw new Error('Semantic memory type required');
    }
    await this.store(memory);
  }

  async addProcedural(memory: MemoryItem): Promise<void> {
    if (memory.type !== 'procedural') {
      throw new Error('Procedural memory type required');
    }
    await this.store(memory);
  }

  async query(query: MemoryQuery & { scope?: string }): Promise<MemorySearchResult[]> {
    if (!query.text) {
      throw new Error('Query text is required');
    }

    const embedding = await this.embeddingProvider.embed(query.text);
    
    // P3: Push type filters into vector metadata queries when supported
    // This prevents dilution by filtering at the vector store level
    const requestedLimit = query.limit ?? 5;
    const hasTypeFilter = query.types && query.types.length > 0;
    
    // Build filter combining scope and type filters
    const filter: Record<string, string> = {};
    if (query.scope) {
      filter.scope = query.scope;
    }
    // P3: Add type filter to metadata query when a single type is requested
    // For multiple types, we still need post-filtering, but single type can be pushed down
    if (hasTypeFilter && query.types!.length === 1) {
      filter.type = query.types![0]!;
    }
    
    // P3: Oversample when multiple types are requested (can't push multi-type filter down)
    // Single type filters are pushed into vector store query, so no oversampling needed
    const needsOversampling = hasTypeFilter && query.types!.length > 1;
    const queryLimit = needsOversampling ? requestedLimit * 3 : requestedLimit;
    
    const candidates = await this.vectorStore.query(embedding, { 
      topK: queryLimit,
      filter: Object.keys(filter).length > 0 ? filter : undefined
    });
    const memories = await this.repository.getByIds(candidates.map((candidate) => candidate.id));

    const now = Date.now();
    // P3: Filter by type after retrieval only if multiple types were requested
    // Single type filtering is already done at vector store level
    const filtered = (hasTypeFilter && query.types!.length > 1)
      ? memories.filter((memory) => query.types?.includes(memory.type))
      : memories;

    const results: MemorySearchResult[] = filtered.map((memory) => {
      const candidate = candidates.find((item) => item.id === memory.id);
      const similarity = candidate?.score ?? 0;
      const decay = timeDecayScore(memory.createdAt, now, this.halfLifeMs);
      const relevance = goalRelevanceScore(memory.content, query.goals);
      const score = aggregateScore(similarity, decay, relevance);

      return {
        memory,
        score,
        similarity,
        timeDecay: decay,
        goalRelevance: relevance
      };
    });

    for (const result of results) {
      await this.repository.updateAccess(result.memory.id, now);
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit ?? results.length);
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

  private async store(memory: MemoryItem): Promise<void> {
    if (!memory.content) {
      throw new Error('Memory content is required');
    }

    if (this.poisoningGuard) {
      const assessment = this.poisoningGuard.assess(memory.content);
      if (!assessment.allowed) {
        throw new Error(`Memory rejected: ${assessment.reasons.join(', ')}`);
      }
    }

    const embedding = await this.embeddingProvider.embed(memory.content);
    
    // Extract scope from ID if it's scoped (format: "scope:id")
    const scopeMatch = memory.id.match(/^([^:]+):(.+)$/);
    const scope = scopeMatch ? scopeMatch[1] : undefined;
    
    await this.vectorStore.upsert([
      {
        id: memory.id,
        vector: embedding,
        metadata: {
          type: memory.type,
          goalId: memory.metadata?.goalId ?? '',
          ...(scope ? { scope } : {})
        }
      }
    ]);

    try {
      await this.repository.save(memory);
    } catch (error) {
      try {
        await this.vectorStore.delete(memory.id);
      } catch {
        // Best-effort rollback; preserve original error.
      }
      throw error;
    }
  }
}
