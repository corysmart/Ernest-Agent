import { FaissVectorStore, type FaissIndex } from '../../memory/vector/faiss-vector-store';

describe('FaissVectorStore', () => {
  it('upserts and queries via index', async () => {
    const index = new FakeIndex();
    const store = new FaissVectorStore(index);

    await store.upsert([
      { id: 'a', vector: [1, 0], metadata: { label: 'first' } },
      { id: 'b', vector: [0, 1], metadata: { label: 'second' } }
    ]);

    const results = await store.query([1, 0], { topK: 1 });

    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('a');
    expect(results[0]!.metadata?.label).toBe('first');
  });
});

class FakeIndex implements FaissIndex {
  private vectors: number[][] = [];
  private ids: string[] = [];

  async add(vectors: number[][], ids: string[]): Promise<void> {
    this.vectors.push(...vectors);
    this.ids.push(...ids);
  }

  async search(vector: number[], topK: number): Promise<{ ids: string[]; distances: number[] }> {
    const distances = this.vectors.map((item) => euclidean(item, vector));
    const sorted = distances
      .map((distance, index) => ({ distance, id: this.ids[index] }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, topK);

    return {
      ids: sorted.map((entry) => entry.id!).filter((id): id is string => id !== undefined),
      distances: sorted.map((entry) => entry.distance)
    };
  }

  async remove(ids: string[]): Promise<void> {
    ids.forEach((id) => {
      const index = this.ids.indexOf(id);
      if (index >= 0) {
        this.ids.splice(index, 1);
        this.vectors.splice(index, 1);
      }
    });
  }
}

function euclidean(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((sum, value, index) => {
    const diff = value - (b[index] ?? 0);
    return sum + diff * diff;
  }, 0));
}
