import { LocalVectorStore } from '../../memory/vector/local-vector-store';

describe('LocalVectorStore', () => {
  it('upserts and queries by cosine similarity', async () => {
    const store = new LocalVectorStore();
    await store.upsert([
      { id: 'a', vector: [1, 0], metadata: { label: 'first' } },
      { id: 'b', vector: [0, 1], metadata: { label: 'second' } }
    ]);

    const results = await store.query([0.9, 0.1], { topK: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('a');
  });

  it('rejects inconsistent vector dimensions', async () => {
    const store = new LocalVectorStore();
    await store.upsert([{ id: 'a', vector: [1, 0] }]);

    await expect(store.upsert([{ id: 'b', vector: [1, 0, 0] }])).rejects.toThrow('Vector dimension mismatch');
  });

  it('rejects NaN values to prevent poisoning', async () => {
    const store = new LocalVectorStore();

    await expect(store.upsert([{ id: 'bad', vector: [Number.NaN, 0] }])).rejects.toThrow('Vector contains invalid values');
  });
});
