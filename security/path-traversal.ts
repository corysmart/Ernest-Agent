import path from 'path';

export function assertSafePath(baseDir: string, targetPath: string): void {
  if (targetPath.includes('\0')) {
    throw new Error('Invalid path');
  }

  const base = path.resolve(baseDir);
  const resolved = path.resolve(baseDir, targetPath);

  if (resolved === base) {
    return;
  }

  if (!resolved.startsWith(base + path.sep)) {
    throw new Error('Path traversal detected');
  }
}
