export interface VectorRecord {
  id: string;
  vector: number[];
  metadata?: Record<string, string>;
}

export interface VectorQueryResult {
  id: string;
  score: number;
  metadata?: Record<string, string>;
}

export interface VectorStore {
  upsert(records: VectorRecord[]): Promise<void>;
  query(vector: number[], options: { topK: number; filter?: Record<string, string> }): Promise<VectorQueryResult[]>;
  delete(id: string): Promise<void>;
}
