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
    for (const pattern of PATTERNS) {
      if (pattern.regex.test(sanitized)) {
        reasons.push(pattern.reason);
        sanitized = sanitized.replace(pattern.regex, '[FILTERED]');
      }
    }

    return {
      sanitized,
      flagged: reasons.length > 0,
      reasons
    };
  }
}
