import type { LLMAdapter, LLMResponse, PromptRequest } from '../../core/contracts/llm';
import { DEFAULT_MAX_TOKENS, countApproxTokens } from '../../core/contracts/llm';
import { isSafeUrl } from '../../security/ssrf-protection';

interface LocalAdapterOptions {
  baseUrl: string;
  generatePath?: string;
  embedPath?: string;
  timeoutMs?: number;
  costPerToken?: number;
  allowlist?: string[];
}

export class LocalLLMAdapter implements LLMAdapter {
  private readonly baseUrl: string;
  private readonly generatePath: string;
  private readonly embedPath: string;
  private readonly timeoutMs: number;
  private readonly costPerToken: number;

  constructor(options: LocalAdapterOptions) {
    this.baseUrl = options.baseUrl;
    this.generatePath = options.generatePath ?? '/generate';
    this.embedPath = options.embedPath ?? '/embed';
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.costPerToken = options.costPerToken ?? 0;

    if (!isSafeUrl(this.baseUrl, options.allowlist ? { allowlist: options.allowlist } : undefined)) {
      throw new Error('Unsafe local model URL');
    }
  }

  async generate(input: PromptRequest): Promise<LLMResponse> {
    if (!input.messages.length) {
      throw new Error('Prompt messages are required');
    }

    const response = await fetchWithTimeout(`${trimSlash(this.baseUrl)}${this.generatePath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: input.messages,
        context: input.context,
        maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: input.temperature ?? 0.2
      })
    }, this.timeoutMs);

    if (!response.ok) {
      throw new Error(`Local model error: ${response.status}`);
    }

    const data = await response.json();
    const content = data?.content ?? data?.text;
    if (!content) {
      throw new Error('Local model response missing content');
    }

    const tokensUsed = data?.tokensUsed ?? countApproxTokens(content);
    return { content, tokensUsed, raw: data };
  }

  async embed(text: string): Promise<number[]> {
    if (!text) {
      throw new Error('Embedding text required');
    }

    const response = await fetchWithTimeout(`${trimSlash(this.baseUrl)}${this.embedPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    }, this.timeoutMs);

    if (!response.ok) {
      throw new Error(`Local embedding error: ${response.status}`);
    }

    const data = await response.json();
    const embedding = data?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error('Local embedding missing');
    }

    return embedding as number[];
  }

  estimateCost(tokens: number): number {
    return tokens * this.costPerToken;
  }
}

function trimSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
