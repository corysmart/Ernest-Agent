/**
 * Tests for schedule_task tool.
 */

import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scheduleTask } from '../../tools/schedule-task';

describe('schedule_task', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'schedule-task-'));
    process.env.SCHEDULED_TASKS_PATH = join(tmpDir, 'tasks.json');
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns error when schedule is missing', async () => {
    const result = await scheduleTask({ goalTitle: 'Test goal' });
    expect(result.success).toBe(false);
    expect((result as { error?: string }).error).toContain('schedule');
  });

  it('returns error when schedule has wrong number of fields', async () => {
    const result = await scheduleTask({ schedule: '0 9', goalTitle: 'Test' });
    expect(result.success).toBe(false);
    expect((result as { error?: string }).error).toContain('5-field');
  });

  it('returns error when goalTitle is missing', async () => {
    const result = await scheduleTask({ schedule: '0 9 * * *' });
    expect(result.success).toBe(false);
    expect((result as { error?: string }).error).toContain('goalTitle');
  });

  it('persists task when valid', async () => {
    const result = await scheduleTask({
      schedule: '0 9 * * *',
      goalTitle: 'Good morning update',
      recipientEmail: 'me@example.com'
    });
    expect(result.success).toBe(true);
    expect((result as { id?: string }).id).toMatch(/^task-/);
    expect(existsSync(process.env.SCHEDULED_TASKS_PATH!)).toBe(true);
    const raw = readFileSync(process.env.SCHEDULED_TASKS_PATH!, 'utf-8');
    const tasks = JSON.parse(raw);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].schedule).toBe('0 9 * * *');
    expect(tasks[0].goalTitle).toBe('Good morning update');
    expect(tasks[0].recipientEmail).toBe('me@example.com');
  });
});
