import type { LLMAdapter, LLMResponse, PromptMessage, PromptRequest } from '../../core/contracts/llm';
import { DEFAULT_MAX_TOKENS, countApproxTokens } from '../../core/contracts/llm';
import { isSafeUrl } from '../../security/ssrf-protection';

interface AnthropicEmbeddingConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface AnthropicAdapterOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  costPerToken?: number;
  anthropicVersion?: string;
  embedding?: AnthropicEmbeddingConfig;
}

export class AnthropicAdapter implements LLMAdapter {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly costPerToken: number;
  private readonly anthropicVersion: string;
  private readonly embedding?: AnthropicEmbeddingConfig;

  constructor(options: AnthropicAdapterOptions) {
    if (!options.apiKey) {
      throw new Error('Anthropic API key required');
    }

    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com/v1';
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.costPerToken = options.costPerToken ?? 0;
    this.anthropicVersion = options.anthropicVersion ?? '2023-06-01';
    this.embedding = options.embedding;

    if (!isSafeUrl(this.baseUrl)) {
      throw new Error('Unsafe Anthropic base URL');
    }

    if (this.embedding && !isSafeUrl(this.embedding.baseUrl)) {
      throw new Error('Unsafe embedding base URL');
    }
  }

  async generate(input: PromptRequest): Promise<LLMResponse> {
    if (!input.messages.length) {
      throw new Error('Prompt messages are required');
    }

    const { system, messages } = splitMessages(input.messages);

    const payload = {
      model: this.model,
      max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages,
      system
    };

    const response = await fetchWithTimeout(`${trimSlash(this.baseUrl)}/messages`, {
      method: 'POST',
      headers: buildHeaders(this.apiKey, this.anthropicVersion),
      body: JSON.stringify(payload)
    }, this.timeoutMs);

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json() as {
      content?: Array<{ text?: string }> | string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const contentParts = Array.isArray(data?.content)
      ? (data.content as Array<{ text?: string }>)
      : [];
    const content = contentParts
      .map((part) => part.text)
      .filter((text): text is string => typeof text === 'string')
      .join('');

    if (!content) {
      throw new Error('Anthropic response missing content');
    }

    const tokensUsed = data?.usage
      ? (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0)
      : countApproxTokens(content);

    return { content, tokensUsed, raw: data };
  }

  async embed(text: string): Promise<number[]> {
    if (!this.embedding) {
      throw new Error('Anthropic embeddings not configured');
    }

    const response = await fetchWithTimeout(`${trimSlash(this.embedding.baseUrl)}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.embedding.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: this.embedding.model, input: text })
    }, this.timeoutMs);

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json() as {
      data?: Array<{ embedding?: number[] }>;
      embedding?: number[];
    };
    const embedding = data?.data?.[0]?.embedding ?? data?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error('Embedding response missing');
    }

    return embedding as number[];
  }

  estimateCost(tokens: number): number {
    return tokens * this.costPerToken;
  }
}

function splitMessages(messages: PromptMessage[]): { system?: string; messages: Array<{ role: string; content: string }> } {
  const systemParts: string[] = [];
  const normalized: Array<{ role: string; content: string }> = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
    } else {
      const role = message.role === 'tool' ? 'assistant' : message.role;
      normalized.push({ role, content: message.content });
    }
  }

  return {
    system: systemParts.length ? systemParts.join('\n') : undefined,
    messages: normalized
  };
}

function buildHeaders(apiKey: string, version: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': version,
    'content-type': 'application/json'
  };
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
