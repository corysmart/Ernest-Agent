import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { syncHeartbeatArchiveFiles } from '../../tools/heartbeat-archive';

describe('syncHeartbeatArchiveFiles', () => {
  const originalWorkspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT;
  let tmpRoot: string;
  let workspaceRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'heartbeat-sync-'));
    workspaceRoot = join(tmpRoot, 'workspace');
    mkdirSync(workspaceRoot, { recursive: true });
    process.env.OPENCLAW_WORKSPACE_ROOT = workspaceRoot;
  });

  afterEach(() => {
    if (originalWorkspaceRoot === undefined) {
      delete process.env.OPENCLAW_WORKSPACE_ROOT;
    } else {
      process.env.OPENCLAW_WORKSPACE_ROOT = originalWorkspaceRoot;
    }
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('archives completed tasks and compacts heartbeat to pending', () => {
    writeFileSync(
      join(workspaceRoot, 'HEARTBEAT.md'),
      `# HEARTBEAT: Build \`ernest-mail\`

## Task Queue

### Phase A
- [x] completed-a
- [ ] pending-a

### Phase B
- [x] completed-b
- [ ] pending-b
`,
      'utf-8'
    );

    const first = syncHeartbeatArchiveFiles();
    expect(first.success).toBe(true);
    expect(first.updatedArchive).toBe(true);
    expect(first.updatedHeartbeat).toBe(true);

    const nextHeartbeat = readFileSync(join(workspaceRoot, 'HEARTBEAT.md'), 'utf-8');
    expect(nextHeartbeat).toContain('- [ ] pending-a');
    expect(nextHeartbeat).toContain('- [ ] pending-b');
    expect(nextHeartbeat).not.toContain('- [x] completed-a');
    expect(nextHeartbeat).not.toContain('- [x] completed-b');

    const archive = readFileSync(join(workspaceRoot, 'HEARTBEAT_ARCHIVE.md'), 'utf-8');
    expect(archive).toContain('## Project: ernest-mail');
    expect(archive).toContain('- [x] completed-a');
    expect(archive).toContain('- [x] completed-b');

    const second = syncHeartbeatArchiveFiles();
    expect(second.success).toBe(true);
    expect(second.updatedArchive).toBe(false);
    expect(second.updatedHeartbeat).toBe(false);
  });
});
