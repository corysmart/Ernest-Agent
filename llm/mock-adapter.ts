import { countApproxTokens, DEFAULT_MAX_TOKENS, type LLMAdapter, type LLMResponse, type PromptRequest } from '../core/contracts/llm';

interface MockAdapterOptions {
  response?: string;
  embeddingSize?: number;
  costPerToken?: number;
  maxInputLength?: number;
  generateFn?: (input: PromptRequest) => string | Promise<string>;
  embedFn?: (text: string, size: number) => number[] | Promise<number[]>;
}

export class MockLLMAdapter implements LLMAdapter {
  private readonly response: string;
  private readonly embeddingSize: number;
  private readonly costPerToken: number;
  private readonly maxInputLength: number;
  private readonly generateFn?: (input: PromptRequest) => string | Promise<string>;
  private readonly embedFn?: (text: string, size: number) => number[] | Promise<number[]>;

  constructor(options: MockAdapterOptions = {}) {
    this.response = options.response ?? 'mock-response';
    this.embeddingSize = options.embeddingSize ?? 8;
    this.costPerToken = options.costPerToken ?? 0.0;
    this.maxInputLength = options.maxInputLength ?? 10_000;
    this.generateFn = options.generateFn;
    this.embedFn = options.embedFn;
  }

  async generate(input: PromptRequest): Promise<LLMResponse> {
    if (!input.messages.length) {
      throw new Error('Prompt messages are required');
    }

    const combined = input.messages.map((message) => message.content).join('\n');
    if (combined.length > this.maxInputLength) {
      throw new Error('Prompt exceeds maximum length');
    }

    const content = this.generateFn
      ? await this.generateFn(input)
      : this.response;

    const tokensUsed = Math.min(
      countApproxTokens(content),
      input.maxTokens ?? DEFAULT_MAX_TOKENS
    );

    return {
      content,
      tokensUsed
    };
  }

  async embed(text: string): Promise<number[]> {
    if (this.embedFn) {
      return this.embedFn(text, this.embeddingSize);
    }

    return simpleEmbedding(text, this.embeddingSize);
  }

  estimateCost(tokens: number): number {
    return tokens * this.costPerToken;
  }
}

function simpleEmbedding(text: string, size: number): number[] {
  const vector = new Array<number>(size).fill(0);
  if (!text.length) {
    return vector;
  }

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const slot = index % size;
    vector[slot] += code;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }

  return vector.map((value) => value / norm);
}
