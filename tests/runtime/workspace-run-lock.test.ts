import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { acquireWorkspaceRunLock, readWorkspaceRunLockOwner } from '../../runtime/workspace-run-lock';

describe('workspace run lock', () => {
  it('acquires and releases lock', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ernest-run-lock-'));
    try {
      const lock = await acquireWorkspaceRunLock({
        workspaceRoot: root,
        owner: 'test-owner',
        waitMs: 100
      });
      expect(lock).not.toBeNull();
      expect(readWorkspaceRunLockOwner(root)).toBe('test-owner');
      lock?.release();
      expect(readWorkspaceRunLockOwner(root)).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns null when lock is held and wait time elapses', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ernest-run-lock-'));
    try {
      const first = await acquireWorkspaceRunLock({
        workspaceRoot: root,
        owner: 'first',
        waitMs: 100
      });
      expect(first).not.toBeNull();

      const second = await acquireWorkspaceRunLock({
        workspaceRoot: root,
        owner: 'second',
        waitMs: 0
      });
      expect(second).toBeNull();
      first?.release();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reclaims lock immediately when owner pid is not alive', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ernest-run-lock-'));
    try {
      const lockDir = join(root, '.ernest-run.lock');
      mkdirSync(lockDir);
      writeFileSync(
        join(lockDir, 'owner.json'),
        JSON.stringify({ owner: 'dead-owner', pid: 999999, createdAt: Date.now() }),
        'utf-8'
      );

      const recovered = await acquireWorkspaceRunLock({
        workspaceRoot: root,
        owner: 'new-owner',
        waitMs: 100,
        staleMs: 60 * 60 * 1000 // long stale window: recovery should happen via dead pid, not mtime
      });

      expect(recovered).not.toBeNull();
      expect(readWorkspaceRunLockOwner(root)).toBe('new-owner');
      recovered?.release();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
