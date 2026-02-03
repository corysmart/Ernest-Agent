const DEFAULT_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  { regex: /ignore (previous|earlier) instructions/iu, reason: 'prompt-injection' },
  { regex: /system prompt/iu, reason: 'system-prompt-access' },
  { regex: /do not obey/iu, reason: 'disobey' }
];

interface MemoryPoisoningOptions {
  maxLength?: number;
  patterns?: Array<{ regex: RegExp; reason: string }>;
}

export class MemoryPoisoningGuard {
  private readonly maxLength: number;
  private readonly patterns: Array<{ regex: RegExp; reason: string }>;

  constructor(options: MemoryPoisoningOptions = {}) {
    this.maxLength = options.maxLength ?? 2000;
    this.patterns = options.patterns ?? DEFAULT_PATTERNS;
  }

  assess(content: string): { allowed: boolean; reasons: string[] } {
    const reasons: string[] = [];

    if (!content || content.trim().length === 0) {
      reasons.push('empty');
    }

    if (content.length > this.maxLength) {
      reasons.push('too-long');
    }

    for (const pattern of this.patterns) {
      if (pattern.regex.test(content)) {
        reasons.push(pattern.reason);
      }
    }

    const nonAlphaRatio = ratioNonAlphanumeric(content);
    if (nonAlphaRatio > 0.6) {
      reasons.push('low-signal');
    }

    return {
      allowed: reasons.length === 0,
      reasons
    };
  }
}

function ratioNonAlphanumeric(text: string): number {
  if (!text) {
    return 1;
  }

  const total = text.length;
  let nonAlpha = 0;
  for (const char of text) {
    if (!/[a-z0-9\s]/iu.test(char)) {
      nonAlpha += 1;
    }
  }

  return nonAlpha / total;
}
