/**
 * Tool: invoke_claude
 *
 * Runs the Claude Code CLI with a pre-submitted prompt. Uses the user's
 * existing Pro, Max, Teams, or Enterprise subscription.
 *
 * Requires Claude Code CLI: brew install claude-code or npm install -g @anthropic-ai/claude-code
 *
 * Prompts passed via temp files to avoid argv exposure in process listings.
 */

import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ToolHandler } from '../security/sandboxed-tool-runner';
import { assertSafePath } from '../security/path-traversal';

const WORKSPACE_ROOT = process.cwd();

export const invokeClaude: ToolHandler = async (
  input: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const prompt = input.prompt;
  const promptFile = input.promptFile ?? input.prompt_file;
  const systemPrompt = input.systemPrompt ?? input.system_prompt;

  const hasPrompt = typeof prompt === 'string' && prompt.trim().length > 0;
  const hasPromptFile = typeof promptFile === 'string' && promptFile.trim().length > 0;

  if (!hasPrompt && !hasPromptFile) {
    return {
      success: false,
      error: 'Either prompt or promptFile is required'
    };
  }

  const rawCwd = typeof input.cwd === 'string' && input.cwd.trim() ? input.cwd : WORKSPACE_ROOT;
  try {
    assertSafePath(WORKSPACE_ROOT, rawCwd);
  } catch {
    return { success: false, error: 'Path traversal detected in cwd' };
  }
  const cwd = rawCwd;

  if (hasPromptFile) {
    try {
      assertSafePath(WORKSPACE_ROOT, (promptFile as string).trim());
    } catch {
      return { success: false, error: 'Path traversal detected in promptFile' };
    }
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'claude-'));
  const cleanup = () => {
    try {
      rmdirSync(tmpDir, { recursive: true });
    } catch {
      /* ignore */
    }
  };

  const args: string[] = [];

  if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
    const sysPath = join(tmpDir, 'system.txt');
    try {
      writeFileSync(sysPath, systemPrompt.trim(), { encoding: 'utf8', mode: 0o600 });
      args.push('--system-prompt-file', sysPath);
    } catch (err) {
      cleanup();
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write system prompt'
      };
    }
  }

  const promptPath = join(tmpDir, 'prompt.txt');
  try {
    let content: string;
    if (hasPromptFile && hasPrompt) {
      content =
        readFileSync((promptFile as string).trim(), 'utf8') +
        '\n\n---\n\n' +
        (prompt as string).trim();
    } else if (hasPromptFile) {
      content = readFileSync((promptFile as string).trim(), 'utf8');
    } else {
      content = (prompt as string).trim();
    }
    writeFileSync(promptPath, content, { encoding: 'utf8', mode: 0o600 });
  } catch (err) {
    cleanup();
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to prepare prompt'
    };
  }
  args.push('-p', promptPath);

  const signal = input.__abortSignal instanceof AbortSignal ? input.__abortSignal : undefined;

  return new Promise((resolve) => {
    const proc = spawn('claude', args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

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
