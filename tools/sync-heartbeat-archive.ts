import type { ToolHandler } from '../security/sandboxed-tool-runner';
import { syncHeartbeatArchiveFiles } from './heartbeat-archive';

/**
 * Tool: sync_heartbeat_archive
 *
 * Rebuilds HEARTBEAT_ARCHIVE.md from completed HEARTBEAT tasks and compacts
 * HEARTBEAT.md to pending tasks only.
 */
export const syncHeartbeatArchive: ToolHandler = async (): Promise<Record<string, unknown>> => {
  const result = syncHeartbeatArchiveFiles();
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? 'Failed to sync heartbeat archive'
    };
  }

  return {
    success: true,
    updatedHeartbeat: result.updatedHeartbeat,
    updatedArchive: result.updatedArchive,
    skipped: result.skipped ?? false,
    reason: result.reason
  };
};
