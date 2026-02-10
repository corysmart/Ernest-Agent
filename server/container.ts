import { Pool } from 'pg';
import { Container } from '../core/di/container';
import { MemoryManager } from '../memory/memory-manager';
import { InMemoryMemoryRepository } from '../memory/repositories/in-memory-memory-repository';
import { PostgresMemoryRepository } from '../memory/repositories/postgres-memory-repository';
import { LocalVectorStore } from '../memory/vector/local-vector-store';
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
import type { EmbeddingProvider } from '../memory/memory-manager';

export interface ContainerContext {
  container: Container;
  rateLimiter: RateLimiter;
  toolRunner: SandboxedToolRunner;
  /**
   * Cleanup method to close database connections and other resources.
   * Should be called when the container is no longer needed (e.g., in test teardown).
   */
  cleanup(): Promise<void>;
}

export interface BuildContainerOptions {
  resolveDns?: boolean;
}

export async function buildContainer(options: BuildContainerOptions = {}): Promise<ContainerContext> {
  const container = new Container();

  // P2: Vector store persistence mismatch handling
  // When DATABASE_URL is set, we use PostgresMemoryRepository for structured memory,
  // but LocalVectorStore for embeddings. This causes desync on restart because:
  // - Structured memories persist in Postgres
  // - Embeddings are lost when LocalVectorStore is cleared
  // Solution: Use a persistent vector store (e.g., pgvector) or re-index on startup
  const vectorStore = new LocalVectorStore();
  const { repository: memoryRepository, pool } = await buildMemoryRepository();
  
  // P2: Warn about vector store persistence mismatch
  // This is a known limitation - in production, implement PostgresVectorStore with pgvector
  // or add a re-indexing step on startup to rebuild embeddings from stored memories
  if (process.env.DATABASE_URL && memoryRepository instanceof PostgresMemoryRepository) {
    console.warn(
      '[WARNING] Vector store persistence mismatch detected:\n' +
      '  - Structured memories persist in Postgres\n' +
      '  - Embeddings are stored in-memory and will be lost on restart\n' +
      '  - This causes memory desync: memories exist but cannot be retrieved by similarity\n' +
      '  - Solution: Implement PostgresVectorStore (pgvector) or add re-indexing on startup'
    );
  }
  const llmAdapter = await buildLlmAdapter(options);
  const embeddingProvider = await buildEmbeddingProvider(llmAdapter, options);
  const memoryManager = new MemoryManager({
    repository: memoryRepository,
    vectorStore,
    embeddingProvider,
    poisoningGuard: new MemoryPoisoningGuard()
  });
  const promptFilter = new PromptInjectionFilter();
  const outputValidator = new ZodOutputValidator(decisionSchema);
  const toolRunner = new SandboxedToolRunner({
    tools: {
      pursue_goal: async (input) => ({ acknowledged: true, input })
    },
    timeoutMs: Number(process.env.TOOL_TIMEOUT_MS ?? 30000) // 30 seconds default
  });
  const permissionGate = new ToolPermissionGate({ allow: ['pursue_goal'] });

  container.registerValue('vectorStore', vectorStore);
  container.registerValue('memoryRepository', memoryRepository);
  container.registerValue('llmAdapter', llmAdapter);
  container.registerValue('memoryManager', memoryManager);
  container.registerValue('promptFilter', promptFilter);
  container.registerValue('outputValidator', outputValidator);
  container.registerValue('permissionGate', permissionGate);

  // P2: Validate rate limiter config to prevent NaN from disabling throttling
  // Use Number.isFinite to ensure valid numeric values, fail fast on invalid config
  const capacityRaw = Number(process.env.RATE_LIMIT_CAPACITY ?? 60);
  const refillRaw = Number(process.env.RATE_LIMIT_REFILL ?? 1);
  
  if (!Number.isFinite(capacityRaw) || capacityRaw <= 0) {
    throw new Error(`Invalid RATE_LIMIT_CAPACITY: ${process.env.RATE_LIMIT_CAPACITY}. Must be a positive number.`);
  }
  if (!Number.isFinite(refillRaw) || refillRaw < 0) {
    throw new Error(`Invalid RATE_LIMIT_REFILL: ${process.env.RATE_LIMIT_REFILL}. Must be a non-negative number.`);
  }
  
  const rateLimiter = new RateLimiter({
    capacity: capacityRaw,
    refillPerSecond: refillRaw
  });

  return {
    container,
    rateLimiter,
    toolRunner,
    async cleanup() {
      // Close Postgres pool if it exists
      if (pool) {
        await pool.end();
      }
      // Clear DNS validation caches in adapters to prevent memory leaks
      // Note: This is a workaround - ideally adapters would expose cleanup methods
      // For now, the caches are module-level and will be garbage collected when modules are unloaded
    }
  };
}

async function buildMemoryRepository(): Promise<{ repository: InMemoryMemoryRepository | PostgresMemoryRepository; pool?: Pool }> {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const repo = new PostgresMemoryRepository(pool);
    await repo.ensureSchema();
    return { repository: repo, pool };
  }

  return { repository: new InMemoryMemoryRepository() };
}

async function buildLlmAdapter(options: BuildContainerOptions = {}): Promise<LLMAdapter> {
  const provider = (process.env.LLM_PROVIDER ?? 'mock').toLowerCase();
  const resolveDns = options.resolveDns ?? (process.env.SSRF_RESOLVE_DNS === 'false' ? false : true);

  if (provider === 'openai') {
    const apiKey = requireEnv('OPENAI_API_KEY');
    const model = requireEnv('OPENAI_MODEL');
    const embeddingModel = requireEnv('OPENAI_EMBEDDING_MODEL');
    const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    
    // Use async factory method that validates DNS
    return await OpenAIAdapter.create({
      apiKey,
      model,
      embeddingModel,
      baseUrl,
      resolveDns
    });
  }

  if (provider === 'anthropic') {
    const apiKey = requireEnv('ANTHROPIC_API_KEY');
    const model = requireEnv('ANTHROPIC_MODEL');
    const baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1';
    const embeddingModel = process.env.ANTHROPIC_EMBEDDING_MODEL;
    const embeddingApiKey = process.env.ANTHROPIC_EMBEDDING_API_KEY;
    const embeddingBaseUrl = process.env.ANTHROPIC_EMBEDDING_BASE_URL ?? baseUrl;

    // Use async factory method that validates DNS
    return await AnthropicAdapter.create({
      apiKey,
      model,
      baseUrl,
      resolveDns,
      embedding: embeddingModel && embeddingApiKey
        ? {
          apiKey: embeddingApiKey,
          baseUrl: embeddingBaseUrl,
          model: embeddingModel
        }
        : undefined
    });
  }

  if (provider === 'local') {
    const baseUrl = requireEnv('LOCAL_LLM_URL');
    const allowlist = process.env.LOCAL_LLM_ALLOWLIST
      ? process.env.LOCAL_LLM_ALLOWLIST.split(',').map((entry) => entry.trim()).filter(Boolean)
      : undefined;
    
    // Use async factory method that validates DNS
    return await LocalLLMAdapter.create({ baseUrl, allowlist, resolveDns });
  }

  return new MockLLMAdapter({
    response: process.env.MOCK_LLM_RESPONSE ?? '{"actionType":"pursue_goal","actionPayload":{},"confidence":0.5}'
  });
}

async function buildEmbeddingProvider(llmAdapter: LLMAdapter, options: BuildContainerOptions = {}): Promise<EmbeddingProvider> {
  const provider = (process.env.EMBEDDING_PROVIDER ?? 'llm').toLowerCase();
  const resolveDns = options.resolveDns ?? (process.env.SSRF_RESOLVE_DNS === 'false' ? false : true);

  if (provider === 'llm') {
    if ((process.env.LLM_PROVIDER ?? 'mock').toLowerCase() === 'anthropic') {
      const hasAnthropicEmbedding = Boolean(process.env.ANTHROPIC_EMBEDDING_MODEL && process.env.ANTHROPIC_EMBEDDING_API_KEY);
      if (!hasAnthropicEmbedding) {
        throw new Error('EMBEDDING_PROVIDER must be set when using Anthropic without embedding configuration');
      }
    }
    return llmAdapter;
  }

  if (provider === 'openai') {
    const apiKey = requireEnv('OPENAI_API_KEY');
    const model = requireEnv('OPENAI_MODEL');
    const embeddingModel = requireEnv('OPENAI_EMBEDDING_MODEL');
    const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    return await OpenAIAdapter.create({ apiKey, model, embeddingModel, baseUrl, resolveDns });
  }

  if (provider === 'anthropic') {
    const apiKey = requireEnv('ANTHROPIC_API_KEY');
    const model = requireEnv('ANTHROPIC_MODEL');
    const embeddingModel = requireEnv('ANTHROPIC_EMBEDDING_MODEL');
    const embeddingApiKey = process.env.ANTHROPIC_EMBEDDING_API_KEY ?? apiKey;
    const baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1';
    const embeddingBaseUrl = process.env.ANTHROPIC_EMBEDDING_BASE_URL ?? baseUrl;
    return await AnthropicAdapter.create({
      apiKey,
      model,
      baseUrl,
      resolveDns,
      embedding: {
        apiKey: embeddingApiKey,
        baseUrl: embeddingBaseUrl,
        model: embeddingModel ?? model
      }
    });
  }

  if (provider === 'local') {
    const baseUrl = process.env.LOCAL_EMBEDDING_URL ?? requireEnv('LOCAL_LLM_URL');
    const allowlist = process.env.LOCAL_LLM_ALLOWLIST
      ? process.env.LOCAL_LLM_ALLOWLIST.split(',').map((entry) => entry.trim()).filter(Boolean)
      : undefined;
    return await LocalLLMAdapter.create({ baseUrl, allowlist, resolveDns });
  }

  if (provider === 'mock') {
    return new MockLLMAdapter();
  }

  throw new Error(`Unsupported EMBEDDING_PROVIDER: ${provider}`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

// Removed assertSafeUrl - DNS validation now handled by adapter factory methods
