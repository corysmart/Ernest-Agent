import { Pool } from 'pg';
import { Container } from '../core/di/container';
import { MemoryManager } from '../memory/memory-manager';
import { InMemoryMemoryRepository } from '../memory/repositories/in-memory-memory-repository';
import { PostgresMemoryRepository } from '../memory/repositories/postgres-memory-repository';
import { LocalVectorStore } from '../memory/vector/local-vector-store';
import { RuleBasedWorldModel } from '../world/world-model';
import { SelfModel } from '../self/self-model';
import { GoalStack } from '../goals/goal-stack';
import { HeuristicPlanner } from '../goals/planner';
import { PromptInjectionFilter } from '../security/prompt-injection-filter';
import { ZodOutputValidator } from '../security/output-validator';
import { ToolPermissionGate } from '../security/tool-permission-gate';
import { MemoryPoisoningGuard } from '../security/memory-poisoning-guard';
import { decisionSchema } from '../security/decision-schema';
import { RateLimiter } from '../security/rate-limiter';
import { SandboxedToolRunner } from '../security/sandboxed-tool-runner';
import { MockLLMAdapter } from '../llm/mock-adapter';
import { OpenAIAdapter } from '../llm/adapters/openai-adapter';
import { AnthropicAdapter } from '../llm/adapters/anthropic-adapter';
import { LocalLLMAdapter } from '../llm/adapters/local-adapter';
import type { LLMAdapter } from '../core/contracts/llm';

export interface ContainerContext {
  container: Container;
  rateLimiter: RateLimiter;
  toolRunner: SandboxedToolRunner;
}

export async function buildContainer(): Promise<ContainerContext> {
  const container = new Container();

  const vectorStore = new LocalVectorStore();
  const memoryRepository = await buildMemoryRepository();
  const llmAdapter = buildLlmAdapter();
  const memoryManager = new MemoryManager({
    repository: memoryRepository,
    vectorStore,
    embeddingProvider: llmAdapter,
    poisoningGuard: new MemoryPoisoningGuard()
  });
  const worldModel = new RuleBasedWorldModel();
  const selfModel = new SelfModel();
  const goalStack = new GoalStack();
  const planner = new HeuristicPlanner(worldModel);
  const promptFilter = new PromptInjectionFilter();
  const outputValidator = new ZodOutputValidator(decisionSchema);
  const toolRunner = new SandboxedToolRunner({
    tools: {
      pursue_goal: async (input) => ({ acknowledged: true, input })
    }
  });
  const permissionGate = new ToolPermissionGate({ allow: ['pursue_goal'] });

  container.registerValue('vectorStore', vectorStore);
  container.registerValue('memoryRepository', memoryRepository);
  container.registerValue('llmAdapter', llmAdapter);
  container.registerValue('memoryManager', memoryManager);
  container.registerValue('worldModel', worldModel);
  container.registerValue('selfModel', selfModel);
  container.registerValue('goalStack', goalStack);
  container.registerValue('planner', planner);
  container.registerValue('promptFilter', promptFilter);
  container.registerValue('outputValidator', outputValidator);
  container.registerValue('permissionGate', permissionGate);

  const rateLimiter = new RateLimiter({
    capacity: Number(process.env.RATE_LIMIT_CAPACITY ?? 60),
    refillPerSecond: Number(process.env.RATE_LIMIT_REFILL ?? 1)
  });

  return { container, rateLimiter, toolRunner };
}

async function buildMemoryRepository() {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const repo = new PostgresMemoryRepository(pool);
    await repo.ensureSchema();
    return repo;
  }

  return new InMemoryMemoryRepository();
}

function buildLlmAdapter(): LLMAdapter {
  const provider = (process.env.LLM_PROVIDER ?? 'mock').toLowerCase();

  if (provider === 'openai') {
    const apiKey = requireEnv('OPENAI_API_KEY');
    const model = requireEnv('OPENAI_MODEL');
    const embeddingModel = requireEnv('OPENAI_EMBEDDING_MODEL');
    return new OpenAIAdapter({
      apiKey,
      model,
      embeddingModel,
      baseUrl: process.env.OPENAI_BASE_URL
    });
  }

  if (provider === 'anthropic') {
    const apiKey = requireEnv('ANTHROPIC_API_KEY');
    const model = requireEnv('ANTHROPIC_MODEL');
    return new AnthropicAdapter({
      apiKey,
      model,
      baseUrl: process.env.ANTHROPIC_BASE_URL
    });
  }

  if (provider === 'local') {
    const baseUrl = requireEnv('LOCAL_LLM_URL');
    const allowlist = process.env.LOCAL_LLM_ALLOWLIST
      ? process.env.LOCAL_LLM_ALLOWLIST.split(',').map((entry) => entry.trim()).filter(Boolean)
      : undefined;
    return new LocalLLMAdapter({ baseUrl, allowlist });
  }

  return new MockLLMAdapter({
    response: process.env.MOCK_LLM_RESPONSE ?? '{"actionType":"pursue_goal","actionPayload":{},"confidence":0.5}'
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
