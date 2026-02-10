import type { ZodSchema } from 'zod';
import { assertSafeObject } from './validation';

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
    } catch (error) {
      return { success: false, errors: ['Invalid JSON output'] };
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
