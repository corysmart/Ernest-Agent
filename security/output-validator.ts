import type { ZodSchema } from 'zod';
import { assertSafeObject } from './validation';

export class ZodOutputValidator<T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  validate(output: string): { success: boolean; data?: T; errors?: string[] } {
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
