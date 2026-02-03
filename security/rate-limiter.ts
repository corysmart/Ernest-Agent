interface RateLimiterOptions {
  capacity: number;
  refillPerSecond: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly buckets = new Map<string, Bucket>();
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
  }

  consume(key: string, tokens: number = 1): boolean {
    if (tokens <= 0) {
      return true;
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
      lastRefill: this.now()
    };
    this.buckets.set(key, bucket);
    return bucket;
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
