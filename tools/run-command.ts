/**
 * Tool: run_command
 *
 * Run a shell command in the workspace. Enables quick checks (npm test, curl, etc.)
 * without Codex cost.
 */

import { spawn } from 'child_process';
import { resolve } from 'path';
import type { ToolHandler } from '../security/sandboxed-tool-runner';
import { assertSafePath } from '../security/path-traversal';
import { getFileWorkspaceRoot } from './file-workspace';

const DEFAULT_TIMEOUT_MS = Number(process.env.RUN_COMMAND_TIMEOUT_MS) || 60000; // 60s

export const runCommand: ToolHandler = async (
  input: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const command = input.command;
  if (typeof command !== 'string' || !command.trim()) {
    return { success: false, error: 'command is required' };
  }

  const workspaceRoot = getFileWorkspaceRoot();
  const cwdArg = input.cwd;
  const cwdStr = typeof cwdArg === 'string' && cwdArg.trim() ? cwdArg.trim() : '.';
  try {
    assertSafePath(workspaceRoot, cwdStr);
  } catch {
    return { success: false, error: 'Path traversal or invalid cwd' };
  }
  const cwd = resolve(workspaceRoot, cwdStr);

  const timeoutMs = typeof input.timeoutMs === 'number' && input.timeoutMs > 0
    ? input.timeoutMs
    : DEFAULT_TIMEOUT_MS;

  return new Promise((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn(command.trim(), {
      shell: true,
      cwd
    });

    const timeoutId = setTimeout(() => {
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 2000);
    }, timeoutMs);

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const finish = (result: Record<string, unknown>) => {
      clearTimeout(timeoutId);
      resolvePromise(result);
    };

    proc.on('close', (code, signal) => {
      finish({
        success: code === 0,
        exitCode: code ?? null,
        signal: signal ?? null,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    proc.on('error', (err) => {
      finish({
        success: false,
        error: err.message,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
};
