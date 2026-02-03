import { assertSafeObject } from '../../security/validation';

describe('validation', () => {
  it('allows safe objects', () => {
    expect(() => assertSafeObject({ ok: true })).not.toThrow();
  });

  it('rejects prototype pollution attempts', () => {
    expect(() => assertSafeObject({ __proto__: { hacked: true } } as any)).toThrow('Unsafe object');
  });
});
