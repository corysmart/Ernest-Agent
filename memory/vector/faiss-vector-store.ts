import type { VectorRecord, VectorQueryResult, VectorStore } from './vector-store';

export interface FaissIndex {
  add(vectors: number[][], ids: string[]): Promise<void>;
  search(vector: number[], topK: number): Promise<{ ids: string[]; distances: number[] }>;
  remove(ids: string[]): Promise<void>;
}

export class FaissVectorStore implements VectorStore {
  private readonly metadata = new Map<string, Record<string, string> | undefined>();

  constructor(private readonly index: FaissIndex) {}

  async upsert(records: VectorRecord[]): Promise<void> {
    for (const record of records) {
      validateVector(record.vector);
    }

    await this.index.add(
      records.map((record) => record.vector),
      records.map((record) => record.id)
    );

    for (const record of records) {
      this.metadata.set(record.id, record.metadata);
    }
  }

  async query(vector: number[], options: { topK: number; filter?: Record<string, string> }): Promise<VectorQueryResult[]> {
    validateVector(vector);

    const result = await this.index.search(vector, options.topK);
    const output: VectorQueryResult[] = [];

    for (let i = 0; i < result.ids.length; i += 1) {
      const id = result.ids[i];
      const distance = result.distances[i];
      if (id === undefined || distance === undefined) {
        continue;
      }
      const metadata = this.metadata.get(id);
      if (options.filter && !matchesFilter(metadata, options.filter)) {
        continue;
      }
      output.push({ id, score: distanceToSimilarity(distance), metadata });
    }

    return output;
  }

  async delete(id: string): Promise<void> {
    await this.index.remove([id]);
    this.metadata.delete(id);
  }
}

function distanceToSimilarity(distance: number): number {
  return 1 / (1 + Math.max(0, distance));
}

function validateVector(vector: number[]): void {
  if (!vector.length) {
    throw new Error('Vector cannot be empty');
  }

  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error('Vector contains invalid values');
  }
}

function matchesFilter(metadata: Record<string, string> | undefined, filter: Record<string, string>): boolean {
  if (!metadata) {
    return false;
  }

  return Object.entries(filter).every(([key, value]) => metadata[key] === value);
}
