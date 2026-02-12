import type { ZodSchema } from 'zod';
import { assertSafeObject } from './validation';

/**
 * Extracts JSON object string from common LLM response patterns:
 * - Markdown code block (```json ... ``` or ``` ... ```)
 * - First balanced { ... } in the string
 */
function extractJsonFromLlmOutput(text: string): string | null {
  const trimmed = text.trim();
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    return codeBlock[1]!.trim();
  }
  const braceStart = trimmed.indexOf('{');
  if (braceStart < 0) return null;
  let depth = 0;
  for (let i = braceStart; i < trimmed.length; i += 1) {
    const c = trimmed[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return trimmed.slice(braceStart, i + 1);
    }
  }
  return null;
}

export class ZodOutputValidator<T> {
  private readonly schema: ZodSchema<T>;
  private readonly maxOutputLength: number;

  constructor(schema: ZodSchema<T>, maxOutputLength: number = 1024 * 1024) {
    this.schema = schema;
    this.maxOutputLength = maxOutputLength; // Default: 1MB
  }

  validate(output: string): { success: boolean; data?: T; errors?: string[] } {
    // P2: Enforce maximum output length before parsing to prevent DoS
    // A malicious or misconfigured model can return extremely large outputs
    if (output.length > this.maxOutputLength) {
      return { success: false, errors: [`Output exceeds maximum length of ${this.maxOutputLength} bytes`] };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      // Raw output not valid JSON; try to extract from markdown or embedded object
      const extracted = extractJsonFromLlmOutput(output);
      if (!extracted) {
        return { success: false, errors: ['Invalid JSON output'] };
      }
      try {
        parsed = JSON.parse(extracted);
      } catch {
        return { success: false, errors: ['Invalid JSON output'] };
      }
    }

    // Handle double-encoded: model returned a JSON string containing the object
    if (typeof parsed === 'string' && parsed.trim().startsWith('{')) {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return { success: false, errors: ['Invalid JSON output'] };
      }
    }

    // Extract from markdown code block if parsed is still a string
    if (typeof parsed === 'string') {
      const extracted = extractJsonFromLlmOutput(parsed);
      if (extracted) {
        try {
          parsed = JSON.parse(extracted);
        } catch {
          return { success: false, errors: ['Invalid JSON output'] };
        }
      }
    }

    // P2: Validate parsed output for unsafe keys and depth before schema validation
    // This prevents prototype pollution and DoS attacks from malicious model responses
    try {
      assertSafeObject(parsed);
    } catch (error) {
      return { success: false, errors: [`Unsafe object detected: ${error instanceof Error ? error.message : 'Unknown error'}`] };
    }

    const result = this.schema.safeParse(parsed);
    if (!result.success) {
      return { success: false, errors: result.error.issues.map((issue) => issue.message) };
    }

    return { success: true, data: result.data };
  }
}
