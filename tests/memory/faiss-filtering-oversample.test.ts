import { FaissVectorStore } from '../../memory/vector/faiss-vector-store';
import type { FaissIndex } from '../../memory/vector/faiss-vector-store';

describe('FAISS Vector Store - Filtering Oversample', () => {
  it('P3: oversamples when filtering to prevent dilution of scoped recall', async () => {
    // Create a mock index that tracks how many results were requested
    let requestedK = 0;
    const mockIndex: FaissIndex = {
      add: async () => {},
      remove: async () => {},
      search: async (vector, topK) => {
        requestedK = topK;
        // Return results where only some match the filter
        const ids: string[] = [];
        const distances: number[] = [];
        
        // First 5 results match filter, next 5 don't
        for (let i = 0; i < topK; i++) {
          ids.push(`id-${i}`);
          distances.push(i * 0.1);
        }
        
        return { ids, distances };
      }
    };

    const store = new FaissVectorStore(mockIndex);

    // Add metadata - only first 5 match the filter
    for (let i = 0; i < 10; i++) {
      await store.upsert([{
        id: `id-${i}`,
        vector: [0.1, 0.2],
        metadata: { scope: i < 5 ? 'scope-a' : 'scope-b' }
      }]);
    }

    // Query with filter requesting topK=5
    const results = await store.query([0.1, 0.2], {
      topK: 5,
      filter: { scope: 'scope-a' }
    });

    // Should have requested more than 5 to account for filtering
    expect(requestedK).toBeGreaterThan(5);
    expect(requestedK).toBe(15); // 5 * 3 (oversample factor)

    // Should return 5 results after filtering
    expect(results.length).toBe(5);
    expect(results.every((r) => r.metadata?.scope === 'scope-a')).toBe(true);
  });

  it('does not oversample when no filter is provided', async () => {
    let requestedK = 0;
    const mockIndex: FaissIndex = {
      add: async () => {},
      remove: async () => {},
      search: async (vector, topK) => {
        requestedK = topK;
        return { ids: ['id-1'], distances: [0.1] };
      }
    };

    const store = new FaissVectorStore(mockIndex);
    await store.upsert([{ id: 'id-1', vector: [0.1, 0.2], metadata: {} }]);

    await store.query([0.1, 0.2], { topK: 5 });

    // Should request exactly topK when no filter
    expect(requestedK).toBe(5);
  });

  it('stops after finding enough results even if more are available', async () => {
    const mockIndex: FaissIndex = {
      add: async () => {},
      remove: async () => {},
      search: async (vector, topK) => {
        const ids: string[] = [];
        const distances: number[] = [];
        // Return many results, all matching filter
        for (let i = 0; i < topK; i++) {
          ids.push(`id-${i}`);
          distances.push(i * 0.1);
        }
        return { ids, distances };
      }
    };

    const store = new FaissVectorStore(mockIndex);

    // Add metadata - all match filter
    for (let i = 0; i < 20; i++) {
      await store.upsert([{
        id: `id-${i}`,
        vector: [0.1, 0.2],
        metadata: { scope: 'scope-a' }
      }]);
    }

    const results = await store.query([0.1, 0.2], {
      topK: 5,
      filter: { scope: 'scope-a' }
    });

    // Should return exactly topK results
    expect(results.length).toBe(5);
  });
});

