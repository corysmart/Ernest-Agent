import type { LLMAdapter, LLMResponse, PromptRequest } from '../../core/contracts/llm';
import { DEFAULT_MAX_TOKENS, countApproxTokens } from '../../core/contracts/llm';
import { isSafeUrl, isSafeUrlBasic } from '../../security/ssrf-protection';

// Symbol to mark factory-created instances (prevents direct constructor usage)
const FACTORY_CREATED = Symbol('factory-created');

// Store DNS validation result with TTL to prevent DNS rebinding window
interface CachedDnsValidation {
  isValid: boolean;
  timestamp: number;
}

const DNS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
const dnsValidationCache = new Map<string, CachedDnsValidation>();

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
  private readonly allowlist?: string[];

  /**
   * Private constructor. Use LocalLLMAdapter.create() instead to ensure DNS rebinding protection.
   */
  private constructor(options: LocalAdapterOptions & { [FACTORY_CREATED]?: boolean }) {
    // Enforce factory pattern - constructor can only be called from create()
    if (!options[FACTORY_CREATED]) {
      throw new Error('LocalLLMAdapter constructor is private. Use LocalLLMAdapter.create() instead.');
    }
    this.baseUrl = options.baseUrl;
    this.generatePath = options.generatePath ?? '/generate';
    this.embedPath = options.embedPath ?? '/embed';
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.costPerToken = options.costPerToken ?? 0;
    this.allowlist = options.allowlist;

    if (!isSafeUrlBasic(this.baseUrl, options.allowlist ? { allowlist: options.allowlist } : undefined)) {
      throw new Error('Unsafe local model URL');
    }
  }

  /**
   * Async factory method that validates DNS before constructing adapter.
   * Use this instead of constructor to prevent SSRF DNS rebinding attacks.
   */
  static async create(options: LocalAdapterOptions & { resolveDns?: boolean }): Promise<LocalLLMAdapter> {
    // Always do basic validation
    if (!isSafeUrlBasic(options.baseUrl, options.allowlist ? { allowlist: options.allowlist } : undefined)) {
      throw new Error('Unsafe local model URL');
    }

    // If DNS resolution is enabled (default) and no allowlist, validate DNS to prevent rebinding
    if (options.resolveDns !== false && (!options.allowlist || options.allowlist.length === 0)) {
      const isSafe = await isSafeUrl(options.baseUrl);
      if (!isSafe) {
        throw new Error(`Unsafe local model URL: ${options.baseUrl} resolves to private IP`);
      }
    }

    return new LocalLLMAdapter({ ...options, [FACTORY_CREATED]: true });
  }

  async generate(input: PromptRequest): Promise<LLMResponse> {
    if (!input.messages.length) {
      throw new Error('Prompt messages are required');
    }

    // Validate URL before making request to prevent DNS rebinding attacks
    const requestUrl = `${trimSlash(this.baseUrl)}${this.generatePath}`;
    
    // If allowlist is configured, skip DNS validation (allowlist bypasses DNS check)
    if (!this.allowlist || this.allowlist.length === 0) {
      const cacheKey = `${this.baseUrl}:no-allowlist`;
      const now = Date.now();
      const cached = dnsValidationCache.get(cacheKey);
      
      // Revalidate if cache expired or URL not cached
      if (!cached || (now - cached.timestamp) > DNS_CACHE_TTL_MS) {
        const isSafe = await isSafeUrl(this.baseUrl);
        if (!isSafe) {
          throw new Error(`Unsafe URL detected: ${this.baseUrl} resolves to private IP`);
        }
        dnsValidationCache.set(cacheKey, { isValid: true, timestamp: now });
      }
    }

    const response = await fetchWithTimeout(requestUrl, {
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

    const data = await response.json() as {
      content?: string;
      text?: string;
      tokensUsed?: number;
    };
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

    // Validate URL before making request to prevent DNS rebinding attacks
    const requestUrl = `${trimSlash(this.baseUrl)}${this.embedPath}`;
    
    // If allowlist is configured, skip DNS validation (allowlist bypasses DNS check)
    if (!this.allowlist || this.allowlist.length === 0) {
      const cacheKey = `${this.baseUrl}:no-allowlist`;
      const now = Date.now();
      const cached = dnsValidationCache.get(cacheKey);
      
      // Revalidate if cache expired or URL not cached
      if (!cached || (now - cached.timestamp) > DNS_CACHE_TTL_MS) {
        const isSafe = await isSafeUrl(this.baseUrl);
        if (!isSafe) {
          throw new Error(`Unsafe URL detected: ${this.baseUrl} resolves to private IP`);
        }
        dnsValidationCache.set(cacheKey, { isValid: true, timestamp: now });
      }
    }

    const response = await fetchWithTimeout(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    }, this.timeoutMs);

    if (!response.ok) {
      throw new Error(`Local embedding error: ${response.status}`);
    }

    const data = await response.json() as {
      embedding?: number[];
    };
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
