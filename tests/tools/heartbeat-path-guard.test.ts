import { mkdtempSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { getCanonicalHeartbeatPath, getHeartbeatPathError } from '../../tools/heartbeat-path-guard';
import { runCommand } from '../../tools/run-command';
import { writeFile } from '../../tools/write-file';

const ORIGINAL_OPENCLAW_WORKSPACE_ROOT = process.env.OPENCLAW_WORKSPACE_ROOT;
const ORIGINAL_FILE_WORKSPACE_ROOT = process.env.FILE_WORKSPACE_ROOT;

describe('heartbeat path guard', () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    process.env.OPENCLAW_WORKSPACE_ROOT = ORIGINAL_OPENCLAW_WORKSPACE_ROOT;
    process.env.FILE_WORKSPACE_ROOT = ORIGINAL_FILE_WORKSPACE_ROOT;
    while (cleanupDirs.length > 0) {
      const dir = cleanupDirs.pop();
      if (!dir) continue;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows canonical HEARTBEAT path', () => {
    const root = mkdtempSync(join(tmpdir(), 'heartbeat-guard-'));
    cleanupDirs.push(root);
    process.env.OPENCLAW_WORKSPACE_ROOT = root;
    const canonical = getCanonicalHeartbeatPath();
    expect(getHeartbeatPathError(canonical)).toBeNull();
  });

  it('rejects non-canonical nested workspace HEARTBEAT path', () => {
    const root = mkdtempSync(join(tmpdir(), 'heartbeat-guard-'));
    cleanupDirs.push(root);
    process.env.OPENCLAW_WORKSPACE_ROOT = join(root, 'Ernest Agent', 'workspace');
    const nested = resolve(root, 'ernest-mail', 'workspace', 'HEARTBEAT.md');
    expect(getHeartbeatPathError(nested)).toContain('Invalid HEARTBEAT path');
  });

  it('run_command blocks workspace/HEARTBEAT.md from sibling repo cwd', async () => {
    const root = mkdtempSync(join(tmpdir(), 'heartbeat-guard-'));
    cleanupDirs.push(root);
    process.env.FILE_WORKSPACE_ROOT = root;
    process.env.OPENCLAW_WORKSPACE_ROOT = join(root, 'Ernest Agent', 'workspace');

    const result = await runCommand({
      command: 'echo test >> workspace/HEARTBEAT.md',
      cwd: 'ernest-mail'
    });
    expect(result.success).toBe(false);
    expect(String(result.error)).toContain('Invalid HEARTBEAT path');
  });

  it('write_file blocks non-canonical nested workspace HEARTBEAT path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'heartbeat-guard-'));
    cleanupDirs.push(root);
    process.env.FILE_WORKSPACE_ROOT = root;
    process.env.OPENCLAW_WORKSPACE_ROOT = join(root, 'Ernest Agent', 'workspace');

    const result = await writeFile({
      path: 'ernest-mail/workspace/HEARTBEAT.md',
      content: 'bad'
    });
    expect(result.success).toBe(false);
    expect(String(result.error)).toContain('Invalid HEARTBEAT path');
  });
});
