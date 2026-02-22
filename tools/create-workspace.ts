/**
 * Tool: create_workspace
 *
 * Creates a new workspace directory for bootstrapping a project (e.g., "ernest-mail").
 * Path must remain under the resolved file workspace root.
 */

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import type { ToolHandler } from '../security/sandboxed-tool-runner';
import { assertSafePath } from '../security/path-traversal';
import { getFileWorkspaceRoot, isRiskyWorkspaceModeEnabled } from './file-workspace';

const SAFE_NAME = /^[a-zA-Z0-9._-]+$/;

function isEmptyDirectory(path: string): boolean {
  try {
    return readdirSync(path).length === 0;
  } catch {
    return false;
  }
}

export const createWorkspace: ToolHandler = async (
  input: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const pathArg = typeof input.path === 'string' ? input.path.trim() : '';
  const workspacePath = pathArg || name;

  if (!workspacePath) {
    return {
      success: false,
      error: 'name or path is required'
    };
  }

  if (name && !SAFE_NAME.test(name)) {
    return {
      success: false,
      error: 'name may only contain letters, numbers, dot, dash, and underscore'
    };
  }

  // Reject path segments that look like duplicates (e.g. "project 2", "folder copy")—often from iCloud or agent re-runs.
  const lastSegment = workspacePath.split(/[/\\]/).pop() ?? workspacePath;
  if (!SAFE_NAME.test(lastSegment)) {
    return {
      success: false,
      error: 'workspace path may only contain letters, numbers, dot, dash, underscore—no spaces or suffixes like " 2" or " copy"'
    };
  }

  const workspaceRoot = getFileWorkspaceRoot();
  try {
    assertSafePath(workspaceRoot, workspacePath);
  } catch {
    return {
      success: false,
      error: 'Path traversal or invalid path'
    };
  }

  const targetPath = resolve(workspaceRoot, workspacePath);
  const allowExisting = input.allowExisting === true;
  const createReadme = input.createReadme !== false;
  const readmeTitle = typeof input.readmeTitle === 'string' && input.readmeTitle.trim()
    ? input.readmeTitle.trim()
    : (name || workspacePath.split(/[\\/]/).pop() || 'workspace');

  let existed = false;
  try {
    existed = existsSync(targetPath);
    if (existed) {
      const stat = statSync(targetPath);
      if (!stat.isDirectory()) {
        return { success: false, error: `Path exists and is not a directory: ${workspacePath}` };
      }
      if (!allowExisting && !isEmptyDirectory(targetPath)) {
        return {
          success: false,
          error: `Workspace already exists and is not empty: ${workspacePath}`
        };
      }
    }

    mkdirSync(targetPath, { recursive: true });
    if (createReadme) {
      const readmePath = join(targetPath, 'README.md');
      if (!existsSync(readmePath)) {
        writeFileSync(readmePath, `# ${readmeTitle}\n`, 'utf-8');
      }
    }

    return {
      success: true,
      created: !existed,
      path: targetPath,
      workspaceRoot,
      riskyMode: isRiskyWorkspaceModeEnabled()
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
};

