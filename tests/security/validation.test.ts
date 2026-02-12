import { assertSafeObject } from '../../security/validation';

describe('validation', () => {
  it('allows safe objects', () => {
    expect(() => assertSafeObject({ ok: true })).not.toThrow();
  });

  it('rejects prototype pollution attempts', () => {
    expect(() => assertSafeObject({ __proto__: { hacked: true } } as Record<string, unknown>)).toThrow('Unsafe object');
  });

  it('allows null and undefined', () => {
    expect(() => assertSafeObject(null)).not.toThrow();
    expect(() => assertSafeObject(undefined)).not.toThrow();
  });

  it('allows primitives', () => {
    expect(() => assertSafeObject(1)).not.toThrow();
    expect(() => assertSafeObject('x')).not.toThrow();
    expect(() => assertSafeObject(true)).not.toThrow();
  });

  it('rejects object with prototype key', () => {
    expect(() => assertSafeObject({ prototype: {} })).toThrow('Unsafe object');
  });

  it('rejects object with constructor key', () => {
    expect(() => assertSafeObject({ constructor: {} })).toThrow('Unsafe object');
  });

  it('rejects object with non-Object prototype', () => {
    class Custom {}
    expect(() => assertSafeObject(new Custom())).toThrow('Unsafe object');
  });

  it('throws when object depth exceeds 50', () => {
    let obj: Record<string, unknown> = { x: 1 };
    const root = obj;
    for (let i = 0; i < 50; i++) {
      obj.nested = {};
      obj = obj.nested as Record<string, unknown>;
    }
    expect(() => assertSafeObject(root)).toThrow('depth exceeds maximum');
  });

  it('allows arrays', () => {
    expect(() => assertSafeObject([1, 2, 3])).not.toThrow();
  });
});
