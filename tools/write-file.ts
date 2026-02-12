/**
 * Tool: write_file
 *
 * Write content to a file in the workspace. Enables the agent to update
 * HEARTBEAT.md or other task state between runs.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import type { ToolHandler } from '../security/sandboxed-tool-runner';
import { assertSafePath } from '../security/path-traversal';
import { getFileWorkspaceRoot } from './file-workspace';

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

  try {
    const dir = dirname(targetPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(targetPath, contentStr, 'utf-8');
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
};
