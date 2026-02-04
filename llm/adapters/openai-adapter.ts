import type { LLMAdapter, LLMResponse, PromptMessage, PromptRequest } from '../../core/contracts/llm';
import { DEFAULT_MAX_TOKENS, countApproxTokens } from '../../core/contracts/llm';
import { isSafeUrl } from '../../security/ssrf-protection';

interface OpenAIAdapterOptions {
  apiKey: string;
  model: string;
  embeddingModel: string;
  baseUrl?: string;
  timeoutMs?: number;
  costPerToken?: number;
  organization?: string;
}

export class OpenAIAdapter implements LLMAdapter {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly embeddingModel: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly costPerToken: number;
  private readonly organization?: string;

  constructor(options: OpenAIAdapterOptions) {
    if (!options.apiKey) {
      throw new Error('OpenAI API key required');
    }
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.embeddingModel = options.embeddingModel;
    this.baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.costPerToken = options.costPerToken ?? 0;
    this.organization = options.organization;

    if (!isSafeUrl(this.baseUrl)) {
      throw new Error('Unsafe OpenAI base URL');
    }
  }

  async generate(input: PromptRequest): Promise<LLMResponse> {
    if (!input.messages.length) {
      throw new Error('Prompt messages are required');
    }

    const payload = {
      model: this.model,
      messages: input.messages.map(toChatMessage),
      max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: input.temperature ?? 0.2
    };

    const response = await fetchWithTimeout(`${trimSlash(this.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: buildHeaders(this.apiKey, this.organization),
      body: JSON.stringify(payload)
    }, this.timeoutMs);

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string }; text?: string }>;
      usage?: { total_tokens?: number };
    };
    const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
    if (!content) {
      throw new Error('OpenAI response missing content');
    }

    const tokensUsed = data?.usage?.total_tokens ?? countApproxTokens(content);

    return { content, tokensUsed, raw: data };
  }

  async embed(text: string): Promise<number[]> {
    if (!text) {
      throw new Error('Embedding text required');
    }

    const payload = {
      model: this.embeddingModel,
      input: text
    };

    const response = await fetchWithTimeout(`${trimSlash(this.baseUrl)}/embeddings`, {
      method: 'POST',
      headers: buildHeaders(this.apiKey, this.organization),
      body: JSON.stringify(payload)
    }, this.timeoutMs);

    if (!response.ok) {
      throw new Error(`OpenAI embedding error: ${response.status}`);
    }

    const data = await response.json() as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error('OpenAI embedding missing');
    }

    return embedding as number[];
  }

  estimateCost(tokens: number): number {
    return tokens * this.costPerToken;
  }
}

function toChatMessage(message: PromptMessage): { role: string; content: string } {
  return { role: message.role, content: message.content };
}

function trimSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function buildHeaders(apiKey: string, organization?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  if (organization) {
    headers['OpenAI-Organization'] = organization;
  }

  return headers;
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
