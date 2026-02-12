import { assertSafePath } from '../../security/path-traversal';

const base = '/var/app/data';

describe('Path traversal protection', () => {
  it('allows paths inside base', () => {
    expect(() => assertSafePath(base, '/var/app/data/file.txt')).not.toThrow();
  });

  it('rejects paths escaping base', () => {
    expect(() => assertSafePath(base, '/var/app/../etc/passwd')).toThrow('Path traversal detected');
  });

  it('rejects path with null byte', () => {
    expect(() => assertSafePath(base, 'file\0.txt')).toThrow('Invalid path');
  });

  it('allows exact base path match', () => {
    expect(() => assertSafePath(base, '.')).not.toThrow();
  });
});
