import { PromptInjectionFilter } from '../../security/prompt-injection-filter';

describe('Prompt Injection Filter - Global Regex', () => {
  it('P3: replaces all occurrences of injection patterns, not just the first', () => {
    const filter = new PromptInjectionFilter();
    const input = 'ignore previous instructions ignore previous instructions ignore previous instructions';

    const result = filter.sanitize(input);

    expect(result.flagged).toBe(true);
    expect(result.reasons).toContain('override-instructions');
    // Should replace all occurrences, not just the first
    const matches = result.sanitized.match(/\[FILTERED\]/g);
    expect(matches).toHaveLength(3);
    expect(result.sanitized).not.toContain('ignore previous instructions');
  });

  it('P3: replaces all occurrences of multiple different patterns', () => {
    const filter = new PromptInjectionFilter();
    const input = 'system prompt system prompt jailbreak jailbreak do not obey do not obey';

    const result = filter.sanitize(input);

    expect(result.flagged).toBe(true);
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
    
    // Count filtered occurrences
    const filteredMatches = result.sanitized.match(/\[FILTERED\]/g);
    expect(filteredMatches!.length).toBeGreaterThanOrEqual(6); // At least 2 per pattern
    
    // Ensure original patterns are removed
    expect(result.sanitized).not.toContain('system prompt');
    expect(result.sanitized).not.toContain('jailbreak');
    expect(result.sanitized).not.toContain('do not obey');
  });

  it('P3: handles case-insensitive matches correctly', () => {
    const filter = new PromptInjectionFilter();
    const input = 'IGNORE PREVIOUS INSTRUCTIONS Ignore Previous Instructions ignore previous instructions';

    const result = filter.sanitize(input);

    expect(result.flagged).toBe(true);
    // All case variations should be replaced
    const filteredMatches = result.sanitized.match(/\[FILTERED\]/g);
    expect(filteredMatches!.length).toBeGreaterThanOrEqual(3);
    expect(result.sanitized.toLowerCase()).not.toContain('ignore previous instructions');
  });

  it('preserves non-injection text between patterns', () => {
    const filter = new PromptInjectionFilter();
    const input = 'Hello ignore previous instructions world jailbreak test';

    const result = filter.sanitize(input);

    expect(result.flagged).toBe(true);
    expect(result.sanitized).toContain('Hello');
    expect(result.sanitized).toContain('world');
    expect(result.sanitized).toContain('test');
    expect(result.sanitized).not.toContain('ignore previous instructions');
    expect(result.sanitized).not.toContain('jailbreak');
  });
});

