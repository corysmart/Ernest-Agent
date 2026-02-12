import { countApproxTokens, DEFAULT_MAX_TOKENS } from '../../core/contracts/llm';

describe('llm contracts', () => {
  it('countApproxTokens returns 0 for empty string', () => {
    expect(countApproxTokens('')).toBe(0);
  });

  it('countApproxTokens approximates tokens for text', () => {
    const n = countApproxTokens('one two three');
    expect(n).toBeGreaterThan(0);
  });

  it('DEFAULT_MAX_TOKENS is defined', () => {
    expect(DEFAULT_MAX_TOKENS).toBe(1024);
  });
});
