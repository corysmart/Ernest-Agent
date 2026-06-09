import type { LLMAdapter, LLMResponse, PromptMessage, PromptRequest } from '../../core/contracts/llm';
import { DEFAULT_MAX_TOKENS, countApproxTokens } from '../../core/contracts/llm';
import { isSafeUrl, isSafeUrlBasic } from '../../security/ssrf-protection';

const FACTORY_CREATED = Symbol('factory-created');
const DEFAULT_API_VERSION = '2024-10-21';
const DNS_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedDnsValidation {
  isValid: boolean;
  timestamp: number;
}

const dnsValidationCache = new Map<string, CachedDnsValidation>();

export interface AzureOpenAIAdapterOptions {
  apiKey: string;
  endpoint: string;
  deployment: string;
  embeddingDeployment: string;
  apiVersion?: string;
  timeoutMs?: number;
  costPerToken?: number;
}

export class AzureOpenAIAdapter implements LLMAdapter {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly deployment: string;
  private readonly embeddingDeployment: string;
  private readonly apiVersion: string;
  private readonly timeoutMs: number;
  private readonly costPerToken: number;
  private readonly resolveDns: boolean;

  private constructor(options: AzureOpenAIAdapterOptions & { resolveDns?: boolean; [FACTORY_CREATED]?: boolean }) {
    if (!options[FACTORY_CREATED]) {
      throw new Error('AzureOpenAIAdapter constructor is private. Use AzureOpenAIAdapter.create() instead.');
    }

    if (!options.apiKey) {
      throw new Error('Azure OpenAI API key required');
    }
    if (!options.endpoint) {
      throw new Error('Azure OpenAI endpoint required');
    }
    if (!options.deployment) {
      throw new Error('Azure OpenAI deployment required');
    }
    if (!options.embeddingDeployment) {
      throw new Error('Azure OpenAI embedding deployment required');
    }

    this.apiKey = options.apiKey;
    this.endpoint = normalizeEndpoint(options.endpoint);
    this.deployment = options.deployment;
    this.embeddingDeployment = options.embeddingDeployment;
    this.apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.costPerToken = options.costPerToken ?? 0;
    this.resolveDns = options.resolveDns !== false;

    if (!isSafeUrlBasic(this.endpoint)) {
      throw new Error('Unsafe Azure OpenAI endpoint');
    }
  }

  static async create(
    options: AzureOpenAIAdapterOptions & { resolveDns?: boolean }
  ): Promise<AzureOpenAIAdapter> {
    const endpoint = normalizeEndpoint(options.endpoint);

    if (!isSafeUrlBasic(endpoint)) {
      throw new Error('Unsafe Azure OpenAI endpoint');
    }

    if (options.resolveDns !== false) {
      const isSafe = await isSafeUrl(endpoint);
      if (!isSafe) {
        throw new Error(`Unsafe Azure OpenAI endpoint: ${endpoint} resolves to private IP`);
      }
    }

    return new AzureOpenAIAdapter({ ...options, endpoint, [FACTORY_CREATED]: true });
  }

  async generate(input: PromptRequest): Promise<LLMResponse> {
    if (!input.messages.length) {
      throw new Error('Prompt messages are required');
    }

    await this.assertEndpointSafe();

    const requestUrl = buildDeploymentUrl(this.endpoint, this.deployment, 'chat/completions', this.apiVersion);
    const payload = {
      model: this.deployment,
      messages: input.messages.map(toChatMessage),
      max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: input.temperature ?? 0.2
    };

    const response = await fetchWithTimeout(requestUrl, {
      method: 'POST',
      headers: buildAzureHeaders(this.apiKey),
      body: JSON.stringify(payload)
    }, this.timeoutMs);

    if (!response.ok) {
      throw new Error(`Azure OpenAI API error: ${response.status}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string }; text?: string }>;
      usage?: { total_tokens?: number };
    };
    const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
    if (!content) {
      throw new Error('Azure OpenAI response missing content');
    }

    const tokensUsed = data?.usage?.total_tokens ?? countApproxTokens(content);
    return { content, tokensUsed, raw: data };
  }

  async embed(text: string): Promise<number[]> {
    if (!text) {
      throw new Error('Embedding text required');
    }

    await this.assertEndpointSafe();

    const requestUrl = buildDeploymentUrl(
      this.endpoint,
      this.embeddingDeployment,
      'embeddings',
      this.apiVersion
    );
    const payload = {
      input: text
    };

    const response = await fetchWithTimeout(requestUrl, {
      method: 'POST',
      headers: buildAzureHeaders(this.apiKey),
      body: JSON.stringify(payload)
    }, this.timeoutMs);

    if (!response.ok) {
      throw new Error(`Azure OpenAI embedding error: ${response.status}`);
    }

    const data = await response.json() as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      throw new Error('Azure OpenAI embedding missing');
    }

    return embedding as number[];
  }

  estimateCost(tokens: number): number {
    return tokens * this.costPerToken;
  }

  private async assertEndpointSafe(): Promise<void> {
    if (!this.resolveDns) {
      return;
    }

    const now = Date.now();
    const cached = dnsValidationCache.get(this.endpoint);
    if (cached && (now - cached.timestamp) <= DNS_CACHE_TTL_MS) {
      return;
    }

    const isSafe = await isSafeUrl(this.endpoint, { resolveDns: true });
    if (!isSafe) {
      throw new Error(`Unsafe URL detected: ${this.endpoint} resolves to private IP`);
    }
    dnsValidationCache.set(this.endpoint, { isValid: true, timestamp: now });
  }
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = trimSlash(endpoint.trim());
  if (trimmed.endsWith('/openai')) {
    return trimmed.slice(0, -'/openai'.length);
  }
  return trimmed;
}

function buildDeploymentUrl(
  endpoint: string,
  deployment: string,
  path: 'chat/completions' | 'embeddings',
  apiVersion: string
): string {
  const url = new URL(
    `${trimSlash(endpoint)}/openai/deployments/${encodeURIComponent(deployment)}/${path}`
  );
  url.searchParams.set('api-version', apiVersion);
  return url.toString();
}

function toChatMessage(message: PromptMessage): { role: string; content: string } {
  return { role: message.role, content: message.content };
}

function trimSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function buildAzureHeaders(apiKey: string): Record<string, string> {
  return {
    'api-key': apiKey,
    'Content-Type': 'application/json'
  };
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
