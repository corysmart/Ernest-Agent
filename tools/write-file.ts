/**
 * Tool: write_file
 *
 * Write content to a file in the workspace. Enables the agent to update
 * HEARTBEAT.md or other task state between runs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import type { ToolHandler } from '../security/sandboxed-tool-runner';
import { assertSafePath } from '../security/path-traversal';
import { getFileWorkspaceRoot } from './file-workspace';
import { getCanonicalHeartbeatPath, getHeartbeatPathError } from './heartbeat-path-guard';
import {
  buildHeartbeatArchive,
  compactHeartbeatKeepingPending,
  getCanonicalHeartbeatArchivePath
} from './heartbeat-archive';

export const writeFile: ToolHandler = async (
  input: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const pathArg = input.path ?? input.file;
  if (typeof pathArg !== 'string' || !pathArg.trim()) {
    return { success: false, error: 'path (or file) is required' };
  }

  const content = input.content;
  if (content === undefined || content === null) {
    return { success: false, error: 'content is required' };
  }
  const contentStr = typeof content === 'string' ? content : String(content);

  const workspaceRoot = getFileWorkspaceRoot();
  try {
    assertSafePath(workspaceRoot, pathArg.trim());
  } catch {
    return { success: false, error: 'Path traversal or invalid path' };
  }

  const targetPath = resolve(workspaceRoot, pathArg.trim());
  const heartbeatPathError = getHeartbeatPathError(targetPath);
  if (heartbeatPathError) {
    return { success: false, error: heartbeatPathError };
  }

  try {
    let contentToWrite = contentStr;
    if (resolve(targetPath) === resolve(getCanonicalHeartbeatPath())) {
      const archivePath = getCanonicalHeartbeatArchivePath();
      const existingArchive = existsSync(archivePath)
        ? readFileSync(archivePath, 'utf-8')
        : '';
      const nextArchive = buildHeartbeatArchive(contentStr, existingArchive);
      const compactedHeartbeat = compactHeartbeatKeepingPending(contentStr);
      mkdirSync(dirname(archivePath), { recursive: true });
      writeFileSync(archivePath, nextArchive, 'utf-8');
      contentToWrite = compactedHeartbeat;
    }

    const dir = dirname(targetPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(targetPath, contentToWrite, 'utf-8');
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
};
