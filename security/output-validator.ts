import type { ZodSchema } from 'zod';

export class ZodOutputValidator<T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  validate(output: string): { success: boolean; data?: T; errors?: string[] } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch (error) {
      return { success: false, errors: ['Invalid JSON output'] };
    }

    const result = this.schema.safeParse(parsed);
    if (!result.success) {
      return { success: false, errors: result.error.issues.map((issue) => issue.message) };
    }

    return { success: true, data: result.data };
  }
}
