import { assertSafePath } from '../../security/path-traversal';
import { realpathSync, mkdirSync, symlinkSync, writeFileSync, unlinkSync, rmdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Path Traversal - Symlink Protection', () => {
  let testDir: string;
  let symlinkPath: string;
  let targetDir: string;

  beforeEach(() => {
    // Create temporary test directories
    testDir = join(tmpdir(), `path-traversal-test-${Date.now()}`);
    targetDir = join(tmpdir(), `path-traversal-target-${Date.now()}`);
    
    mkdirSync(testDir, { recursive: true });
    mkdirSync(targetDir, { recursive: true });
    
    // Create a symlink inside testDir pointing to targetDir
    symlinkPath = join(testDir, 'symlink');
    symlinkSync(targetDir, symlinkPath);
  });

  afterEach(() => {
    // Cleanup
    try {
      unlinkSync(symlinkPath);
    } catch {}
    try {
      rmdirSync(testDir);
    } catch {}
    try {
      rmdirSync(targetDir);
    } catch {}
  });

  it('P3: blocks path traversal via symlinks pointing outside baseDir', () => {
    // Create a file outside the base directory
    const outsideFile = join(targetDir, 'secret.txt');
    writeFileSync(outsideFile, 'secret data');

    // Try to access the file via symlink
    const maliciousPath = join(symlinkPath, 'secret.txt');

    // Should detect path traversal even though symlink is inside baseDir
    expect(() => {
      assertSafePath(testDir, maliciousPath);
    }).toThrow('Path traversal detected');
  });

  it('allows access to files within baseDir even with symlinks', () => {
    // Create a file inside testDir
    const safeFile = join(testDir, 'safe.txt');
    writeFileSync(safeFile, 'safe data');

    // Should allow access to files within baseDir
    expect(() => {
      assertSafePath(testDir, safeFile);
    }).not.toThrow();
  });

  it('P3: resolves symlinks before checking path boundaries', () => {
    // Create a file outside baseDir
    const outsideFile = join(targetDir, 'outside.txt');
    writeFileSync(outsideFile, 'outside');

    // Access via symlink - should be blocked
    const symlinkFile = join(symlinkPath, 'outside.txt');
    
    expect(() => {
      assertSafePath(testDir, symlinkFile);
    }).toThrow('Path traversal detected');
  });
});

