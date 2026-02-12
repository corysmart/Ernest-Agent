/**
 * Tool: read_file
 *
 * Read file contents from the workspace. Enables the agent to inspect the codebase
 * without calling Codex.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { ToolHandler } from '../security/sandboxed-tool-runner';
import { assertSafePath } from '../security/path-traversal';
import { getFileWorkspaceRoot } from './file-workspace';

const MAX_FILE_BYTES = Number(process.env.READ_FILE_MAX_BYTES) || 524288; // 512KB

export const readFile: ToolHandler = async (
  input: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const pathArg = input.path ?? input.file;
  if (typeof pathArg !== 'string' || !pathArg.trim()) {
    return { success: false, error: 'path (or file) is required' };
  }

  const workspaceRoot = getFileWorkspaceRoot();
  let targetPath: string;
  try {
    targetPath = resolve(workspaceRoot, pathArg.trim());
    assertSafePath(workspaceRoot, pathArg.trim());
  } catch {
    return { success: false, error: 'Path traversal or invalid path' };
  }

  if (!existsSync(targetPath)) {
    return { success: false, error: `File not found: ${pathArg.trim()}` };
  }

  const encoding = (input.encoding as string) || 'utf-8';
  if (encoding !== 'utf-8' && encoding !== 'base64') {
    return { success: false, error: 'encoding must be utf-8 or base64' };
  }

  try {
    const buf = readFileSync(targetPath);
    if (buf.length > MAX_FILE_BYTES) {
      return {
        success: false,
        error: `File too large (${buf.length} bytes, max ${MAX_FILE_BYTES})`
      };
    }
    const content = encoding === 'base64' ? buf.toString('base64') : buf.toString('utf-8');
    return { success: true, content };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
};
