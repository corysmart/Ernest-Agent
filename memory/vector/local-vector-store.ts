import { cosineSimilarity } from '../scoring';
import type { VectorRecord, VectorQueryResult, VectorStore } from './vector-store';

interface StoredRecord extends VectorRecord {
  norm: number;
}

export class LocalVectorStore implements VectorStore {
  private readonly records = new Map<string, StoredRecord>();
  private dimension?: number;

  async upsert(records: VectorRecord[]): Promise<void> {
    for (const record of records) {
      this.validateVector(record.vector);
      this.setDimension(record.vector.length);
      const norm = vectorNorm(record.vector);
      this.records.set(record.id, { ...record, norm });
    }
  }

  async query(vector: number[], options: { topK: number; filter?: Record<string, string | string[]> }): Promise<VectorQueryResult[]> {
    this.validateVector(vector);
    this.setDimension(vector.length);
    const queryNorm = vectorNorm(vector);

    const results: VectorQueryResult[] = [];
    for (const record of this.records.values()) {
      if (options.filter && !matchesFilter(record.metadata, options.filter)) {
        continue;
      }

      const score = cosineSimilarity(vector, record.vector, queryNorm, record.norm);
      results.push({ id: record.id, score, metadata: record.metadata });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK);
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }

  private setDimension(length: number): void {
    if (this.dimension === undefined) {
      this.dimension = length;
      return;
    }

    if (this.dimension !== length) {
      throw new Error('Vector dimension mismatch');
    }
  }

  private validateVector(vector: number[]): void {
    if (!vector.length) {
      throw new Error('Vector cannot be empty');
    }

    if (vector.some((value) => !Number.isFinite(value))) {
      throw new Error('Vector contains invalid values');
    }
  }
}

function vectorNorm(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function matchesFilter(metadata: Record<string, string> | undefined, filter: Record<string, string | string[]>): boolean {
  if (!metadata) {
    return false;
  }

  return Object.entries(filter).every(([key, value]) => {
    const metadataValue = metadata[key];
    if (metadataValue === undefined) {
      return false;
    }
    // P3: Support array values for multi-type filtering (e.g., type: ['episodic', 'semantic'])
    if (Array.isArray(value)) {
      return value.includes(metadataValue);
    }
    return metadataValue === value;
  });
}
