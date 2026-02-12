/**
 * Codex CLI adapter – uses OpenAI Codex via terminal instead of API.
 * Requires no API key; uses the user's ChatGPT subscription.
 *
 * Prerequisite: npm install -g @openai/codex or brew install codex
 */

import { spawn } from 'child_process';
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

export class CodexLLMAdapter implements LLMAdapter {
  private readonly cwd: string;

  constructor(options?: { cwd?: string }) {
    this.cwd = options?.cwd ?? process.cwd();
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
    return new Promise((resolve) => {
      const proc = spawn('codex', [prompt], {
        cwd: this.cwd,
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

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
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
  }
}
