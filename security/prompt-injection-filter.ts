const PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  { regex: /ignore (previous|earlier) instructions/iu, reason: 'override-instructions' },
  { regex: /system prompt/iu, reason: 'system-prompt-access' },
  { regex: /jailbreak/iu, reason: 'jailbreak' },
  { regex: /do not obey/iu, reason: 'disobey' },
  { regex: /act as/iu, reason: 'role-play' }
];

export class PromptInjectionFilter {
  constructor(private readonly maxLength: number = 8000) {}

  sanitize(input: string): { sanitized: string; flagged: boolean; reasons: string[] } {
    let sanitized = input ?? '';
    if (sanitized.length > this.maxLength) {
      sanitized = sanitized.slice(0, this.maxLength);
    }

    const reasons: string[] = [];
    // P3: Use global regexes or loop replacements to catch all matches, not just the first
    for (const pattern of PATTERNS) {
      // Create a global version of the regex to match all occurrences
      const globalRegex = new RegExp(pattern.regex.source, pattern.regex.flags + 'g');
      if (globalRegex.test(sanitized)) {
        reasons.push(pattern.reason);
        // Replace all matches, not just the first
        sanitized = sanitized.replace(globalRegex, '[FILTERED]');
      }
    }

    return {
      sanitized,
      flagged: reasons.length > 0,
      reasons
    };
  }
}
