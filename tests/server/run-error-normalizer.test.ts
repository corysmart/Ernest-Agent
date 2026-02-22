import { normalizeRunError, parseUsageLimitRetryAt } from '../../server/run-error-normalizer';

describe('run-error-normalizer', () => {
  it('returns error as-is for non-usage-limit errors', () => {
    const result = normalizeRunError('Something went wrong');
    expect(result.errorKind).toBeUndefined();
    expect(result.displayError).toBe('Something went wrong');
  });

  it('detects usage limit and sets errorKind', () => {
    const raw =
      'ERROR: "You\'ve hit your usage limit. Upgrade to Pro, visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Feb 27th, 2026 10:33 PM.", "context":{"stateTrace":["observe","query_llm","error"]}}';
    const result = normalizeRunError(raw);
    expect(result.errorKind).toBe('usage_limit');
    expect(result.displayError).toContain('Usage limit reached');
    expect(result.displayError).toContain('chatgpt.com/codex/settings/usage');
    expect(result.displayError).toContain('Try again after Feb 27th');
    expect(result.displayError).not.toContain('stateTrace');
  });

  it('extracts try again date when present', () => {
    const result = normalizeRunError('Usage limit. Try again at Mar 1st, 2026.');
    expect(result.errorKind).toBe('usage_limit');
    expect(result.displayError).toContain('Try again after');
  });

  it('handles undefined and empty error', () => {
    expect(normalizeRunError(undefined).displayError).toBe('Unknown error');
    expect(normalizeRunError('').displayError).toBe('Unknown error');
  });
});

describe('parseUsageLimitRetryAt', () => {
  it('returns null for non-usage-limit or missing date', () => {
    expect(parseUsageLimitRetryAt(undefined)).toBeNull();
    expect(parseUsageLimitRetryAt('Some other error')).toBeNull();
  });

  it('parses "try again at Feb 27th, 2026 10:33 PM"', () => {
    const raw = 'Usage limit. Try again at Feb 27th, 2026 10:33 PM.';
    const d = parseUsageLimitRetryAt(raw);
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(1); // Feb = 1
    expect(d!.getDate()).toBe(27);
    expect(d!.getHours()).toBe(22); // 10:33 PM = 22
    expect(d!.getMinutes()).toBe(33);
  });

  it('returns null when parsed date is in the past', () => {
    const raw = 'Usage limit. Try again at Jan 1st, 2020 12:00 AM.';
    expect(parseUsageLimitRetryAt(raw)).toBeNull();
  });
});
