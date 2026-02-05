interface RateLimiterOptions {
  capacity: number;
  refillPerSecond: number;
  /**
   * Maximum number of buckets to keep in memory. When exceeded, oldest buckets are evicted.
   * Default: 10000
   */
  maxBuckets?: number;
  /**
   * TTL for buckets in milliseconds. Buckets older than this are evicted.
   * Default: 1 hour (3600000ms)
   */
  bucketTtlMs?: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
  createdAt: number;
}

export class RateLimiter {
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxBuckets: number;
  private readonly bucketTtlMs: number;
  private timeOffsetMs = 0;

  constructor(options: RateLimiterOptions) {
    if (options.capacity <= 0) {
      throw new Error('Capacity must be positive');
    }
    if (options.refillPerSecond < 0) {
      throw new Error('Refill rate must be non-negative');
    }

    this.capacity = options.capacity;
    this.refillPerSecond = options.refillPerSecond;
    this.maxBuckets = options.maxBuckets ?? 10000;
    this.bucketTtlMs = options.bucketTtlMs ?? 3600000; // 1 hour default
  }

  consume(key: string, tokens: number = 1): boolean {
    if (tokens <= 0) {
      return true;
    }

    // Evict old buckets before processing
    this.evictOldBuckets();

    // Enforce max bucket limit with LRU eviction
    if (this.buckets.size >= this.maxBuckets && !this.buckets.has(key)) {
      this.evictOldestBucket();
    }

    const bucket = this.getBucket(key);
    this.refill(bucket);

    if (bucket.tokens < tokens) {
      return false;
    }

    bucket.tokens -= tokens;
    return true;
  }

  tick(ms: number): void {
    this.timeOffsetMs += ms;
  }

  private getBucket(key: string): Bucket {
    const existing = this.buckets.get(key);
    if (existing) {
      return existing;
    }

    const bucket: Bucket = {
      tokens: this.capacity,
      lastRefill: this.now(),
      createdAt: this.now()
    };
    this.buckets.set(key, bucket);
    return bucket;
  }

  /**
   * Evicts buckets that are older than TTL
   */
  private evictOldBuckets(): void {
    const now = this.now();
    const keysToDelete: string[] = [];

    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.createdAt > this.bucketTtlMs) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.buckets.delete(key);
    }
  }

  /**
   * Evicts the oldest bucket (LRU eviction)
   */
  private evictOldestBucket(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.createdAt < oldestTime) {
        oldestTime = bucket.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.buckets.delete(oldestKey);
    }
  }

  private refill(bucket: Bucket): void {
    const now = this.now();
    const elapsedSeconds = Math.max(0, now - bucket.lastRefill) / 1000;
    if (elapsedSeconds <= 0) {
      return;
    }

    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + elapsedSeconds * this.refillPerSecond
    );
    bucket.lastRefill = now;
  }

  private now(): number {
    return Date.now() + this.timeOffsetMs;
  }
}
