/**
 * Codex CLI adapter – uses OpenAI Codex via terminal instead of API.
 * Requires no API key; uses the user's ChatGPT subscription.
 *
 * Prerequisite: npm install -g @openai/codex or brew install codex
 *
 * Prompts are passed via stdin (temp file as fd) to avoid argv exposure in process listings.
 */

import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync, openSync, closeSync, rmdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { killOnAbort, KILL_GRACE_MS } from '../../tools/cli-kill';
import {
  countApproxTokens,
  DEFAULT_MAX_TOKENS,
  type LLMAdapter,
  type LLMResponse,
  type PromptRequest
} from '../../core/contracts/llm';

const EMBEDDING_SIZE = 8;

function simpleEmbedding(text: string, size: number): number[] {
  const vector = new Array<number>(size).fill(0);
  if (!text.length) {
    return vector;
  }
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const slot = i % size;
    vector[slot] = (vector[slot] ?? 0) + code;
  }
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  return norm === 0 ? vector : vector.map((v) => v / norm);
}

const DEFAULT_CODEX_TIMEOUT_MS = 300_000; // 5 min, matches runTimeoutMs

export class CodexLLMAdapter implements LLMAdapter {
  private readonly cwd: string;
  private readonly timeoutMs: number;

  constructor(options?: { cwd?: string; timeoutMs?: number }) {
    this.cwd = options?.cwd ?? process.cwd();
    const envMs = process.env.CODEX_TIMEOUT_MS ? parseInt(process.env.CODEX_TIMEOUT_MS, 10) : NaN;
    this.timeoutMs = options?.timeoutMs ?? (!Number.isNaN(envMs) && envMs > 0 ? envMs : DEFAULT_CODEX_TIMEOUT_MS);
  }

  async generate(input: PromptRequest): Promise<LLMResponse> {
    if (!input.messages.length) {
      throw new Error('Prompt messages are required');
    }

    const prompt = input.messages
      .map((m) => (m.role === 'system' ? `[System]\n${m.content}` : `[User]\n${m.content}`))
      .join('\n\n');

    const result = await this.runCodex(prompt);
    if (!result.success) {
      throw new Error(result.error ?? `Codex failed: ${result.stderr || result.stdout}`);
    }

    const content = (result.stdout || '').trim();
    const tokensUsed = Math.min(
      countApproxTokens(content),
      input.maxTokens ?? DEFAULT_MAX_TOKENS
    );

    return { content, tokensUsed };
  }

  async embed(text: string): Promise<number[]> {
    return simpleEmbedding(text, EMBEDDING_SIZE);
  }

  estimateCost(_tokens: number): number {
    return 0;
  }

  private runCodex(prompt: string): Promise<{
    success: boolean;
    stdout?: string;
    stderr?: string;
    error?: string;
  }> {
    const tmpDir = mkdtempSync(join(tmpdir(), 'codex-'));
    const promptPath = join(tmpDir, 'p.txt');
    let fd: number;
    try {
      writeFileSync(promptPath, prompt, { encoding: 'utf8', mode: 0o600 });
      fd = openSync(promptPath, 'r');
    } catch (err) {
      try {
        rmdirSync(tmpDir, { recursive: true });
      } catch {
        /* ignore */
      }
      return Promise.resolve({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write temp prompt'
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const proc = spawn('codex', ['exec'], {
        cwd: this.cwd,
        shell: false,
        stdio: [fd, 'pipe', 'pipe'],
        signal: controller.signal
      });

      killOnAbort(proc, controller.signal, KILL_GRACE_MS);

      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      const cleanup = () => {
        clearTimeout(timeoutId);
        try {
          closeSync(fd);
          rmdirSync(tmpDir, { recursive: true });
        } catch {
          /* ignore */
        }
      };

      proc.on('close', (code, sig) => {
        cleanup();
        const timedOut = sig === 'SIGTERM';
        resolve({
          success: code === 0 && !timedOut,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          ...(timedOut && { error: `Codex timed out after ${this.timeoutMs}ms` })
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
  }
}
