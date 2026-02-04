import type { LLMAdapter, LLMResponse, PromptMessage, PromptRequest } from '../../core/contracts/llm';
import { DEFAULT_MAX_TOKENS, countApproxTokens } from '../../core/contracts/llm';
import { isSafeUrl, isSafeUrlBasic } from '../../security/ssrf-protection';

// Store DNS validation result with TTL to prevent DNS rebinding window
interface CachedDnsValidation {
  isValid: boolean;
  timestamp: number;
}

const DNS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
const dnsValidationCache = new Map<string, CachedDnsValidation>();

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

  /**
   * @deprecated Use OpenAIAdapter.create() instead. Direct constructor usage bypasses DNS rebinding protection.
   */
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

    if (!isSafeUrlBasic(this.baseUrl)) {
      throw new Error('Unsafe OpenAI base URL');
    }
    
    // Warn about security risk
    console.warn('OpenAIAdapter: Direct constructor usage bypasses DNS rebinding protection. Use OpenAIAdapter.create() instead.');
  }

  /**
   * Async factory method that validates DNS before constructing adapter.
   * Use this instead of constructor to prevent SSRF DNS rebinding attacks.
   */
  static async create(options: OpenAIAdapterOptions & { resolveDns?: boolean }): Promise<OpenAIAdapter> {
    const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1';
    
    // Always do basic validation
    if (!isSafeUrlBasic(baseUrl)) {
      throw new Error('Unsafe OpenAI base URL');
    }

    // If DNS resolution is enabled (default), validate DNS to prevent rebinding
    if (options.resolveDns !== false) {
      const isSafe = await isSafeUrl(baseUrl);
      if (!isSafe) {
        throw new Error(`Unsafe OpenAI base URL: ${baseUrl} resolves to private IP`);
      }
    }

    return new OpenAIAdapter(options);
  }

  async generate(input: PromptRequest): Promise<LLMResponse> {
    if (!input.messages.length) {
      throw new Error('Prompt messages are required');
    }

    // Validate URL before making request to prevent DNS rebinding attacks
    const requestUrl = `${trimSlash(this.baseUrl)}/chat/completions`;
    const now = Date.now();
    const cached = dnsValidationCache.get(this.baseUrl);
    
    // Revalidate if cache expired or URL not cached
    if (!cached || (now - cached.timestamp) > DNS_CACHE_TTL_MS) {
      const isSafe = await isSafeUrl(this.baseUrl);
      if (!isSafe) {
        throw new Error(`Unsafe URL detected: ${this.baseUrl} resolves to private IP`);
      }
      dnsValidationCache.set(this.baseUrl, { isValid: true, timestamp: now });
    }

    const payload = {
      model: this.model,
      messages: input.messages.map(toChatMessage),
      max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: input.temperature ?? 0.2
    };

    const response = await fetchWithTimeout(requestUrl, {
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

    // Validate URL before making request to prevent DNS rebinding attacks
    const requestUrl = `${trimSlash(this.baseUrl)}/embeddings`;
    const now = Date.now();
    const cached = dnsValidationCache.get(this.baseUrl);
    
    // Revalidate if cache expired or URL not cached
    if (!cached || (now - cached.timestamp) > DNS_CACHE_TTL_MS) {
      const isSafe = await isSafeUrl(this.baseUrl);
      if (!isSafe) {
        throw new Error(`Unsafe URL detected: ${this.baseUrl} resolves to private IP`);
      }
      dnsValidationCache.set(this.baseUrl, { isValid: true, timestamp: now });
    }

    const payload = {
      model: this.embeddingModel,
      input: text
    };

    const response = await fetchWithTimeout(requestUrl, {
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
