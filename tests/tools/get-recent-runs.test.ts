/**
 * Tests for get_recent_runs tool.
 */

import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getRecentRuns } from '../../tools/get-recent-runs';

describe('get_recent_runs', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'get-recent-runs-'));
    process.env.OBS_UI_DATA_DIR = tmpDir;
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty when runs file does not exist', async () => {
    const result = await getRecentRuns({});
    expect(result.success).toBe(true);
    expect((result as { runs?: unknown[] }).runs).toEqual([]);
  });

  it('returns runs when file exists', async () => {
    const runs = [
      { requestId: 'r1', status: 'completed', timestamp: 1000 },
      { requestId: 'r2', status: 'error', timestamp: 2000 }
    ];
    writeFileSync(join(tmpDir, 'runs.json'), JSON.stringify(runs), 'utf-8');
    const result = await getRecentRuns({ limit: 5 });
    expect(result.success).toBe(true);
    expect((result as { runs?: unknown[] }).runs).toHaveLength(2);
    expect((result as { total?: number }).total).toBe(2);
  });

  it('respects limit', async () => {
    const runs = Array.from({ length: 20 }, (_, i) => ({
      requestId: `r${i}`,
      status: 'completed',
      timestamp: i
    }));
    writeFileSync(join(tmpDir, 'runs.json'), JSON.stringify(runs), 'utf-8');
    const result = await getRecentRuns({ limit: 3 });
    expect(result.success).toBe(true);
    expect((result as { runs?: unknown[] }).runs).toHaveLength(3);
    expect((result as { total?: number }).total).toBe(20);
  });
});
