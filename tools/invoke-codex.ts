/**
 * Tool: invoke_codex
 *
 * Runs the OpenAI Codex CLI with a pre-submitted prompt. Uses the user's
 * existing ChatGPT/Codex authentication (subscription).
 *
 * Requires Codex CLI to be installed: npm install -g @openai/codex or brew install codex
 *
 * Prompt passed via stdin (temp file) to avoid argv exposure in process listings.
 */

import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync, openSync, closeSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir, homedir } from 'os';
import type { ToolHandler } from '../security/sandboxed-tool-runner';
import { assertSafePath } from '../security/path-traversal';
import { killOnAbort, KILL_GRACE_MS } from './cli-kill';

const WORKSPACE_ROOT = (() => {
  const raw = process.env.CODEX_CWD;
  return raw ? resolve(raw.replace(/^~/, homedir())) : process.cwd();
})();

export const invokeCodex: ToolHandler = async (
  input: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const prompt = input.prompt ?? input.goal;
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return { success: false, error: 'prompt (or goal) is required and must be a non-empty string' };
  }

  const rawCwd = typeof input.cwd === 'string' && input.cwd.trim() ? input.cwd : WORKSPACE_ROOT;
  try {
    assertSafePath(WORKSPACE_ROOT, rawCwd);
  } catch {
    return { success: false, error: 'Path traversal detected in cwd' };
  }
  const cwd = rawCwd;

  const tmpDir = mkdtempSync(join(tmpdir(), 'codex-'));
  const promptPath = join(tmpDir, 'p.txt');
  let fd: number;
  try {
    writeFileSync(promptPath, prompt.trim(), { encoding: 'utf8', mode: 0o600 });
    fd = openSync(promptPath, 'r');
  } catch (err) {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch {
      /* ignore */
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to write temp prompt'
    };
  }

  const signal = input.__abortSignal instanceof AbortSignal ? input.__abortSignal : undefined;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const proc = spawn('codex', ['exec'], {
      cwd,
      shell: false,
      stdio: [fd, 'pipe', 'pipe'],
      signal,
      detached: process.platform !== 'win32'
    });

    killOnAbort(proc, signal, KILL_GRACE_MS, true);

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const cleanup = () => {
      try {
        closeSync(fd);
        rmSync(tmpDir, { recursive: true });
      } catch {
        /* ignore */
      }
    };

    proc.on('close', (code, sig) => {
      cleanup();
      resolve({
        success: code === 0,
        exitCode: code ?? null,
        signal: sig ?? null,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    proc.on('error', (err) => {
      cleanup();
      resolve({
        success: false,
        error: err.message,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
};
