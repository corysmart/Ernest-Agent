import { ZodOutputValidator } from '../../security/output-validator';
import { z } from 'zod';

const schema = z.object({
  actionType: z.string(),
  actionPayload: z.record(z.unknown()).optional()
});

describe('ZodOutputValidator - Unsafe Object Protection', () => {
  it('P2: rejects output with __proto__ key', () => {
    const validator = new ZodOutputValidator(schema);
    // Use JSON string directly to ensure __proto__ is treated as a property, not prototype assignment
    const maliciousOutput = '{"actionType":"test","__proto__":{"polluted":true}}';

    const result = validator.validate(maliciousOutput);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toMatch(/Unsafe object/i);
  });

  it('P2: rejects output with prototype key', () => {
    const validator = new ZodOutputValidator(schema);
    // Use JSON string directly
    const maliciousOutput = '{"actionType":"test","prototype":{"polluted":true}}';

    const result = validator.validate(maliciousOutput);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toMatch(/Unsafe object/i);
  });

  it('P2: rejects output with constructor key', () => {
    const validator = new ZodOutputValidator(schema);
    // Use JSON string directly
    const maliciousOutput = '{"actionType":"test","constructor":{"polluted":true}}';

    const result = validator.validate(maliciousOutput);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toMatch(/Unsafe object/i);
  });

  it('P2: rejects output with deeply nested structure exceeding depth limit', () => {
    const validator = new ZodOutputValidator(schema);
    
    // Create a deeply nested object (more than 50 levels)
    let nested: any = { actionType: 'test' };
    for (let i = 0; i < 60; i++) {
      nested = { nested };
    }
    const maliciousOutput = JSON.stringify(nested);

    const result = validator.validate(maliciousOutput);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain('depth exceeds maximum');
  });

  it('accepts safe output after unsafe object validation', () => {
    const validator = new ZodOutputValidator(schema);
    const safeOutput = JSON.stringify({
      actionType: 'test',
      actionPayload: { goalId: 'goal-1' }
    });

    const result = validator.validate(safeOutput);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.actionType).toBe('test');
  });
});

