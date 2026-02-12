/**
 * Resolve the workspace root for file operations (read_file, list_dir, write_file, run_command).
 * Used by all file-based tools to enforce path safety.
 */

import { resolve } from 'path';
import { homedir } from 'os';

export function getFileWorkspaceRoot(): string {
  const raw = process.env.FILE_WORKSPACE_ROOT ?? process.env.CODEX_CWD ?? process.cwd();
  const expanded = typeof raw === 'string' ? raw.replace(/^~/, homedir()) : process.cwd();
  return resolve(expanded);
}
