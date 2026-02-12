import { z } from 'zod';
import { ZodOutputValidator } from '../../security/output-validator';

describe('ZodOutputValidator', () => {
  const schema = z.object({
    actionType: z.string().min(1),
    actionPayload: z.record(z.unknown()).optional(),
    confidence: z.number().min(0).max(1)
  });

  it('validates correct JSON output', () => {
    const validator = new ZodOutputValidator(schema);
    const result = validator.validate('{"actionType":"test","confidence":0.8}');

    expect(result.success).toBe(true);
    expect(result.data?.actionType).toBe('test');
  });

  it('rejects invalid output', () => {
    const validator = new ZodOutputValidator(schema);
    const result = validator.validate('not-json');

    expect(result.success).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it('accepts double-encoded JSON (string containing object)', () => {
    const validator = new ZodOutputValidator(schema);
    const inner = '{"actionType":"test","confidence":0.8}';
    const result = validator.validate(JSON.stringify(inner));

    expect(result.success).toBe(true);
    expect(result.data?.actionType).toBe('test');
  });

  it('extracts JSON from markdown code block', () => {
    const validator = new ZodOutputValidator(schema);
    const result = validator.validate('```json\n{"actionType":"test","confidence":0.8}\n```');

    expect(result.success).toBe(true);
    expect(result.data?.actionType).toBe('test');
  });

  it('extracts JSON from embedded object in text', () => {
    const validator = new ZodOutputValidator(schema);
    const result = validator.validate('Here is my decision: {"actionType":"test","confidence":0.8}');

    expect(result.success).toBe(true);
    expect(result.data?.actionType).toBe('test');
  });
});
