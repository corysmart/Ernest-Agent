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
});
