/**
 * Tests for create_workspace tool and risky workspace mode.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createWorkspace } from '../../tools/create-workspace';

const ORIGINAL_FILE_WORKSPACE_ROOT = process.env.FILE_WORKSPACE_ROOT;
const ORIGINAL_RISKY_WORKSPACE_MODE = process.env.RISKY_WORKSPACE_MODE;
const ORIGINAL_FILE_WORKSPACE_MODE = process.env.FILE_WORKSPACE_MODE;
const ORIGINAL_RISKY_WORKSPACE_ROOT = process.env.RISKY_WORKSPACE_ROOT;

describe('create_workspace', () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    process.env.FILE_WORKSPACE_ROOT = ORIGINAL_FILE_WORKSPACE_ROOT;
    process.env.RISKY_WORKSPACE_MODE = ORIGINAL_RISKY_WORKSPACE_MODE;
    process.env.FILE_WORKSPACE_MODE = ORIGINAL_FILE_WORKSPACE_MODE;
    process.env.RISKY_WORKSPACE_ROOT = ORIGINAL_RISKY_WORKSPACE_ROOT;

    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (!dir) continue;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates workspace in safe mode under FILE_WORKSPACE_ROOT', async () => {
    const safeRoot = mkdtempSync(join(tmpdir(), 'create-workspace-safe-'));
    cleanupDirs.push(safeRoot);
    process.env.FILE_WORKSPACE_ROOT = safeRoot;
    delete process.env.RISKY_WORKSPACE_MODE;
    delete process.env.FILE_WORKSPACE_MODE;
    delete process.env.RISKY_WORKSPACE_ROOT;

    const result = await createWorkspace({ name: 'ernest-mail' });

    expect(result.success).toBe(true);
    expect((result as { path?: string }).path).toBe(join(safeRoot, 'ernest-mail'));
    expect(existsSync(join(safeRoot, 'ernest-mail', 'README.md'))).toBe(true);
    expect((result as { riskyMode?: boolean }).riskyMode).toBe(false);
  });

  it('rejects path traversal in safe mode', async () => {
    const safeRoot = mkdtempSync(join(tmpdir(), 'create-workspace-traversal-'));
    cleanupDirs.push(safeRoot);
    process.env.FILE_WORKSPACE_ROOT = safeRoot;
    delete process.env.RISKY_WORKSPACE_MODE;
    delete process.env.FILE_WORKSPACE_MODE;
    delete process.env.RISKY_WORKSPACE_ROOT;

    const result = await createWorkspace({ path: '../ernest-mail' });

    expect(result.success).toBe(false);
    expect((result as { error?: string }).error).toContain('Path traversal');
  });

  it('uses parent of safe root in risky mode when RISKY_WORKSPACE_ROOT is not set', async () => {
    const parentRoot = mkdtempSync(join(tmpdir(), 'create-workspace-parent-'));
    const safeRoot = join(parentRoot, 'ernest-agent');
    mkdirSync(safeRoot, { recursive: true });
    cleanupDirs.push(parentRoot);

    process.env.FILE_WORKSPACE_ROOT = safeRoot;
    process.env.RISKY_WORKSPACE_MODE = 'true';
    delete process.env.FILE_WORKSPACE_MODE;
    delete process.env.RISKY_WORKSPACE_ROOT;

    const result = await createWorkspace({ name: 'ernest-mail' });

    expect(result.success).toBe(true);
    expect((result as { path?: string }).path).toBe(join(parentRoot, 'ernest-mail'));
    expect((result as { workspaceRoot?: string }).workspaceRoot).toBe(parentRoot);
    expect((result as { riskyMode?: boolean }).riskyMode).toBe(true);
  });

  it('uses explicit RISKY_WORKSPACE_ROOT when risky mode is enabled', async () => {
    const baseRoot = mkdtempSync(join(tmpdir(), 'create-workspace-explicit-'));
    const safeRoot = join(baseRoot, 'ernest-agent');
    const riskyRoot = join(baseRoot, 'repositories');
    mkdirSync(safeRoot, { recursive: true });
    mkdirSync(riskyRoot, { recursive: true });
    cleanupDirs.push(baseRoot);

    process.env.FILE_WORKSPACE_ROOT = safeRoot;
    process.env.RISKY_WORKSPACE_MODE = 'true';
    process.env.RISKY_WORKSPACE_ROOT = riskyRoot;
    delete process.env.FILE_WORKSPACE_MODE;

    const result = await createWorkspace({ name: 'ernest-mail' });

    expect(result.success).toBe(true);
    expect((result as { path?: string }).path).toBe(join(riskyRoot, 'ernest-mail'));
    expect((result as { workspaceRoot?: string }).workspaceRoot).toBe(riskyRoot);
  });

  it('blocks non-empty existing workspace unless allowExisting=true', async () => {
    const safeRoot = mkdtempSync(join(tmpdir(), 'create-workspace-existing-'));
    cleanupDirs.push(safeRoot);
    const existing = join(safeRoot, 'ernest-mail');
    mkdirSync(existing, { recursive: true });
    writeFileSync(join(existing, 'file.txt'), 'x', 'utf-8');

    process.env.FILE_WORKSPACE_ROOT = safeRoot;
    delete process.env.RISKY_WORKSPACE_MODE;
    delete process.env.FILE_WORKSPACE_MODE;
    delete process.env.RISKY_WORKSPACE_ROOT;

    const blocked = await createWorkspace({ name: 'ernest-mail' });
    expect(blocked.success).toBe(false);

    const allowed = await createWorkspace({ name: 'ernest-mail', allowExisting: true });
    expect(allowed.success).toBe(true);
  });
});

