/**
 * Tool: invoke_claude
 *
 * Runs the Claude Code CLI with a pre-submitted prompt. Uses the user's
 * existing Pro, Max, Teams, or Enterprise subscription.
 *
 * Requires Claude Code CLI: brew install claude-code or npm install -g @anthropic-ai/claude-code
 */

import { spawn } from 'child_process';
import type { ToolHandler } from '../security/sandboxed-tool-runner';

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

  const cwd =
    typeof input.cwd === 'string' && input.cwd.trim() ? input.cwd : process.cwd();

  const args: string[] = [];

  if (typeof systemPrompt === 'string' && systemPrompt.trim()) {
    args.push('--system-prompt', systemPrompt.trim());
  }

  if (hasPromptFile) {
    args.push('-p', (promptFile as string).trim());
  }

  if (hasPrompt) {
    args.push((prompt as string).trim());
  }

  return new Promise((resolve) => {
    const proc = spawn('claude', args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code, signal) => {
      resolve({
        success: code === 0,
        exitCode: code ?? null,
        signal: signal ?? null,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        error: err.message,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
};
