/**
 * Tool: get_recent_runs
 *
 * Returns a summary of recent agent runs from the observability store.
 * Reads from the persisted runs file when OBS_UI_ENABLED; otherwise returns empty.
 *
 * Configure OBS_UI_DATA_DIR (default: data/observability).
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import type { ToolHandler } from '../security/sandboxed-tool-runner';

function resolveRunsPath(): string {
  const raw = process.env.OBS_UI_DATA_DIR ?? 'data/observability';
  const expanded = raw.replace(/^~/, homedir());
  return join(resolve(process.cwd(), expanded), 'runs.json');
}

interface RunEntry {
  requestId?: string;
  tenantId?: string;
  timestamp?: number;
  status?: string;
  selectedGoalId?: string;
  error?: string;
  durationMs?: number;
}

export const getRecentRuns: ToolHandler = async (
  input: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const limitRaw = input.limit;
  const limit = typeof limitRaw === 'number' && limitRaw > 0 && limitRaw <= 100
    ? Math.floor(limitRaw)
    : 10;

  const path = resolveRunsPath();
  if (!existsSync(path)) {
    return {
      success: true,
      runs: [],
      message: 'No run history. Enable OBS_UI_ENABLED to persist runs.'
    };
  }

  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    const runs = Array.isArray(parsed) ? parsed as RunEntry[] : [];
    const recent = runs.slice(0, limit).map((r) => ({
      requestId: r.requestId,
      tenantId: r.tenantId,
      timestamp: r.timestamp,
      status: r.status,
      selectedGoalId: r.selectedGoalId,
      error: r.error,
      durationMs: r.durationMs
    }));
    return {
      success: true,
      runs: recent,
      total: runs.length
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
};
