/**
 * Tool: invoke_codex
 *
 * Runs the OpenAI Codex CLI with a pre-submitted prompt. Uses the user's
 * existing ChatGPT/Codex authentication (subscription).
 *
 * Requires Codex CLI to be installed: npm install -g @openai/codex or brew install codex
 */

import { spawn } from 'child_process';
import type { ToolHandler } from '../security/sandboxed-tool-runner';

export const invokeCodex: ToolHandler = async (
  input: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const prompt = input.prompt;
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return { success: false, error: 'prompt is required and must be a non-empty string' };
  }

  const cwd =
    typeof input.cwd === 'string' && input.cwd.trim() ? input.cwd : process.cwd();

  return new Promise((resolve) => {
    const proc = spawn('codex', [prompt.trim()], {
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
