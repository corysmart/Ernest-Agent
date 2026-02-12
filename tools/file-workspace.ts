/**
 * Resolve the workspace root for file operations (read_file, list_dir, write_file, run_command).
 * Used by all file-based tools to enforce path safety.
 */

import { dirname, resolve } from 'path';
import { homedir } from 'os';

function expandHomePath(raw: string): string {
  return raw.replace(/^~/, homedir());
}

function getSafeWorkspaceRoot(): string {
  const raw = process.env.FILE_WORKSPACE_ROOT ?? process.env.CODEX_CWD ?? process.cwd();
  const expanded = typeof raw === 'string' ? expandHomePath(raw) : process.cwd();
  return resolve(expanded);
}

/**
 * Risky mode intentionally broadens workspace scope so an agent can bootstrap sibling projects.
 * OFF by default. Enable with RISKY_WORKSPACE_MODE=true or FILE_WORKSPACE_MODE=risky.
 */
export function isRiskyWorkspaceModeEnabled(): boolean {
  if (process.env.RISKY_WORKSPACE_MODE === 'true' || process.env.RISKY_WORKSPACE_MODE === '1') {
    return true;
  }
  const mode = process.env.FILE_WORKSPACE_MODE;
  return typeof mode === 'string' && mode.toLowerCase() === 'risky';
}

export function getFileWorkspaceRoot(): string {
  const safeRoot = getSafeWorkspaceRoot();
  if (!isRiskyWorkspaceModeEnabled()) {
    return safeRoot;
  }

  // If no explicit risky root is provided, default to parent of safe root (sibling workspace support).
  const rawRiskyRoot = process.env.RISKY_WORKSPACE_ROOT;
  if (typeof rawRiskyRoot === 'string' && rawRiskyRoot.trim()) {
    return resolve(expandHomePath(rawRiskyRoot.trim()));
  }

  return dirname(safeRoot);
}
