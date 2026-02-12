/**
 * Tool: list_dir
 *
 * List directory contents. Enables the agent to see project layout between steps.
 */

import { readdirSync, statSync } from 'fs';
import { resolve } from 'path';
import type { ToolHandler } from '../security/sandboxed-tool-runner';
import { assertSafePath } from '../security/path-traversal';
import { getFileWorkspaceRoot } from './file-workspace';

export const listDir: ToolHandler = async (
  input: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const pathArg = (input.path ?? input.dir ?? '.') as string;
  const pathStr = typeof pathArg === 'string' ? pathArg : '.';

  const workspaceRoot = getFileWorkspaceRoot();
  try {
    assertSafePath(workspaceRoot, pathStr || '.');
  } catch {
    return { success: false, error: 'Path traversal or invalid path' };
  }

  const targetPath = resolve(workspaceRoot, pathStr);

  try {
    const stat = statSync(targetPath);
    if (!stat.isDirectory()) {
      return { success: false, error: 'Not a directory' };
    }
    const names = readdirSync(targetPath);
    const entries = names.map((name) => {
      const fullPath = resolve(targetPath, name);
      let isFile = false;
      let isDirectory = false;
      try {
        const s = statSync(fullPath);
        isFile = s.isFile();
        isDirectory = s.isDirectory();
      } catch {
        /* ignore symlinks to inaccessible paths */
      }
      return { name, isFile, isDirectory };
    });
    return { success: true, entries };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
};
