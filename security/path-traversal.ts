import path from 'path';
import { realpathSync } from 'fs';

export function assertSafePath(baseDir: string, targetPath: string): void {
  if (targetPath.includes('\0')) {
    throw new Error('Invalid path');
  }

  const base = path.resolve(baseDir);
  const resolved = path.resolve(baseDir, targetPath);

  // P3: Resolve symlinks to prevent bypass via symlinks pointing outside baseDir
  // Use fs.realpathSync to resolve symlinks and get the actual path
  let realBase: string;
  let realResolved: string;
  
  try {
    realBase = realpathSync(base);
    realResolved = realpathSync(resolved);
  } catch (error) {
    // If realpath fails (e.g., path doesn't exist), fall back to resolved paths
    // This is acceptable for paths that may not exist yet but should still be validated
    realBase = base;
    realResolved = resolved;
  }

  if (realResolved === realBase) {
    return;
  }

  if (!realResolved.startsWith(realBase + path.sep)) {
    throw new Error('Path traversal detected');
  }
}
