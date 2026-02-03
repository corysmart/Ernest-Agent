export type PromptRole = 'system' | 'user' | 'assistant' | 'tool';

export interface PromptMessage {
  role: PromptRole;
  content: string;
}

export interface PromptContext {
  memory?: string;
  worldState?: string;
  selfModel?: string;
  goals?: string;
}

export interface PromptRequest {
  messages: PromptMessage[];
  context?: PromptContext;
  maxTokens?: number;
  temperature?: number;
  metadata?: Record<string, string>;
}

export interface LLMResponse {
  content: string;
  tokensUsed: number;
  raw?: unknown;
}

export interface LLMAdapter {
  generate(input: PromptRequest): Promise<LLMResponse>;
  embed(text: string): Promise<number[]>;
  estimateCost(tokens: number): number;
}

export const DEFAULT_MAX_TOKENS = 1024;

export function countApproxTokens(text: string): number {
  if (!text) {
    return 0;
  }

  return Math.ceil(text.trim().split(/\s+/u).length * 1.3);
}
