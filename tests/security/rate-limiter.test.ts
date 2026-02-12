import { RateLimiter } from '../../security/rate-limiter';

describe('RateLimiter', () => {
  it('allows up to capacity then blocks', () => {
    const limiter = new RateLimiter({ capacity: 2, refillPerSecond: 0 });

    expect(limiter.consume('agent', 1)).toBe(true);
    expect(limiter.consume('agent', 1)).toBe(true);
    expect(limiter.consume('agent', 1)).toBe(false);
  });

  it('refills tokens over time', () => {
    const limiter = new RateLimiter({ capacity: 1, refillPerSecond: 1 });

    expect(limiter.consume('agent', 1)).toBe(true);
    limiter.tick(1000);
    expect(limiter.consume('agent', 1)).toBe(true);
  });

  it('consume with 0 tokens returns true', () => {
    const limiter = new RateLimiter({ capacity: 1, refillPerSecond: 0 });
    expect(limiter.consume('agent', 0)).toBe(true);
  });

  it('rejects zero capacity', () => {
    expect(() => new RateLimiter({ capacity: 0, refillPerSecond: 1 })).toThrow('Capacity must be positive');
  });

  it('rejects negative refill rate', () => {
    expect(() => new RateLimiter({ capacity: 1, refillPerSecond: -1 })).toThrow('Refill rate must be non-negative');
  });

  describe('P3: Bucket eviction', () => {
    it('evicts buckets older than TTL', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillPerSecond: 1,
        bucketTtlMs: 1000,
        maxBuckets: 100
      });

      // Create a bucket
      limiter.consume('key1', 1);

      // Advance time past TTL
      limiter.tick(2000);

      // Create another bucket - should evict old one
      limiter.consume('key2', 1);

      // key1 should be evicted, so it gets a fresh bucket
      expect(limiter.consume('key1', 1)).toBe(true);
    });

    it('evicts oldest bucket when maxBuckets exceeded', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillPerSecond: 1,
        maxBuckets: 3
      });

      // Fill up to max
      limiter.consume('key1', 1);
      limiter.consume('key2', 1);
      limiter.consume('key3', 1);

      // Add one more - should evict oldest (key1)
      limiter.consume('key4', 1);

      // key1 should get a fresh bucket (was evicted)
      expect(limiter.consume('key1', 1)).toBe(true);
    });

    it('evicts old buckets before processing new requests', () => {
      const limiter = new RateLimiter({
        capacity: 10,
        refillPerSecond: 1,
        bucketTtlMs: 500,
        maxBuckets: 100
      });

      limiter.consume('old-key', 1);
      limiter.tick(1000); // Past TTL

      // Should evict old bucket before processing
      limiter.consume('new-key', 1);

      // old-key should get fresh bucket
      expect(limiter.consume('old-key', 1)).toBe(true);
    });
  });
});
