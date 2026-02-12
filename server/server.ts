import Fastify, { type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { buildContainer } from './container';
import { CognitiveAgent } from '../core/agent/cognitive-agent';
import { RequestEnvironment } from './request-environment';
import { assertSafeObject } from '../security/validation';
import { RuleBasedWorldModel } from '../world/world-model';
import { SelfModel } from '../self/self-model';
import { GoalStack } from '../goals/goal-stack';
import { HeuristicPlanner } from '../goals/planner';
import type { MemoryManager } from '../memory/memory-manager';
import { ScopedMemoryManager } from '../memory/scoped-memory-manager';
import { StructuredAuditLogger } from '../security/audit-logger';
import type { LLMAdapter } from '../core/contracts/llm';
import type { PromptInjectionFilter, OutputValidator } from '../core/contracts/security';
import type { AgentDecision } from '../core/contracts/agent';
import type { ToolPermissionGate } from '../core/contracts/security';

const observationSchema = z.object({
  timestamp: z.number().optional(),
  state: z.record(z.unknown()),
  events: z.array(z.string()).optional()
});

const goalSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.number().min(0).default(1),
  horizon: z.enum(['short', 'long']).default('short'),
  candidateActions: z
    .array(z.object({
      type: z.string().min(1),
      payload: z.record(z.unknown()).optional()
    }))
    .optional()
});

const runOnceSchema = z.object({
  observation: observationSchema,
  goal: goalSchema.optional(),
  // P3: Validate tenantId to reject colons (ScopedMemoryManager rejects scopes with colons)
  // Also add max length to prevent abuse
  tenantId: z.string()
    .min(1)
    .max(256)
    .refine((val) => !val.includes(':'), { message: 'tenantId cannot contain colons' })
    .optional(),
  /** with-llm: call LLM, validate, skip act/memory/self. without-llm: skip LLM, use stub, skip act/memory/self. */
  dryRun: z.enum(['with-llm', 'without-llm']).optional()
});

/**
 * P1: Authentication middleware - validates auth token and extracts tenantId from authenticated principal.
 * Currently supports API key authentication via Authorization header.
 * Can be extended to support JWT, OAuth, etc.
 */
interface AuthenticatedRequest {
  tenantId?: string;
  principal?: string;
}

function authenticateRequest(request: FastifyRequest): AuthenticatedRequest | null {
  const authHeader = request.headers.authorization;
  
  if (!authHeader) {
    return null; // No auth header - anonymous request
  }

  // Support "Bearer <token>" or "ApiKey <key>" format
  const parts = authHeader.split(' ');
  if (parts.length !== 2) {
    return null; // Invalid format
  }

  const [scheme, token] = parts;
  
  // P1: API Key authentication (can be extended to JWT, OAuth, etc.)
  if (scheme === 'ApiKey' || scheme === 'Bearer') {
    // For now, validate against environment variable API_KEY
    // In production, this should validate against a database or auth service
    const validApiKey = process.env.API_KEY;
    if (validApiKey && token === validApiKey) {
      // Extract tenantId from token or use a mapping
      // For now, use a simple format: "tenant-<id>" or extract from token payload
      // In production, decode JWT or query auth service for tenantId
      const tenantMatch = token.match(/tenant[_-]?([a-zA-Z0-9-]+)/i);
      const tenantId = tenantMatch ? tenantMatch[1] : undefined;
      
      return {
        tenantId,
        principal: `api-key:${token.substring(0, 8)}...`
      };
    }
  }

  return null; // Invalid or missing auth
}

export async function buildServer(options?: { logger?: boolean }) {
  const fastify = Fastify({ logger: options?.logger ?? true });
  const containerContext = await buildContainer();
  const { container, rateLimiter, toolRunner } = containerContext;
  
  // Register cleanup on server close
  fastify.addHook('onClose', async () => {
    await containerContext.cleanup();
  });

  fastify.addHook('onRequest', (request, reply, done) => {
    if (!rateLimiter.consume(request.ip, 1)) {
      reply.code(429).send({ error: 'Rate limit exceeded' });
      return;
    }
    done();
  });

  fastify.get('/health', async () => ({ status: 'ok' }));

  fastify.post('/agent/run-once', async (request, reply) => {
    assertSafeObject(request.body as Record<string, unknown>);
    const parsed = runOnceSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: parsed.error.issues.map((issue) => issue.message).join('; ') });
      return;
    }

    const { observation, goal, tenantId: clientTenantId, dryRun } = parsed.data;
    
    // P1: Authenticate request and bind tenantId to authenticated principal
    const auth = authenticateRequest(request);
    
    // P1: Enforce authentication when API_KEY is configured
    // If API_KEY is set, all requests must be authenticated to prevent auth bypass
    if (process.env.API_KEY && !auth) {
      reply.code(401).send({
        error: 'Authentication required',
        hint: 'API_KEY is configured. Please provide a valid Authorization header (ApiKey <key> or Bearer <token>)'
      });
      return;
    }
    
    // If client supplies tenantId, it must match authenticated tenantId
    if (clientTenantId) {
      if (!auth || auth.tenantId !== clientTenantId) {
        reply.code(403).send({ 
          error: 'Tenant ID mismatch. Client-supplied tenantId must match authenticated principal.',
          hint: 'Remove tenantId from request body or ensure it matches your authenticated tenant'
        });
        return;
      }
    }
    
    // Use authenticated tenantId, fallback to request-scoped ID for anonymous requests (only when API_KEY is not set)
    const tenantId = auth?.tenantId;
    
    // P3: Generate unique requestId per request to prevent collisions
    // Multiple requests from the same tenant should have different requestIds for proper audit traceability
    // Keep tenantId separate from requestId to avoid masking cross-request behavior in logs
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // Create scoped memory manager for tenant isolation
    // Use tenantId as scope if authenticated, otherwise use requestId
    const baseMemoryManager = container.resolve<MemoryManager>('memoryManager');
    const memoryScope = tenantId ?? requestId;
    const persistMemory = Boolean(tenantId); // Persist memory only for authenticated tenants
    const scopedMemoryManager = new ScopedMemoryManager(baseMemoryManager, memoryScope, persistMemory);
    
    // Create audit logger for this request
    const auditLogger = new StructuredAuditLogger();
    
    // Create scoped goal stack for tenant isolation (already per-request)
    const goalStack = new GoalStack();
    if (goal) {
      try {
        goalStack.addGoal({
          ...goal,
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      } catch (error) {
        reply.code(409).send({ error: error instanceof Error ? error.message : 'Goal conflict' });
        return;
      }
    }

    const environment = new RequestEnvironment({
      timestamp: observation.timestamp ?? Date.now(),
      state: observation.state,
      events: observation.events
    }, toolRunner, {
      auditLogger,
      tenantId, // P3: Propagate authenticated tenantId to audit logging
      requestId
    });

    const worldModel = new RuleBasedWorldModel();
    const selfModel = new SelfModel();
    const planner = new HeuristicPlanner(worldModel);

    const agent = new CognitiveAgent({
      environment,
      memoryManager: scopedMemoryManager,
      worldModel,
      selfModel,
      goalStack,
      planner,
      llmAdapter: container.resolve<LLMAdapter>('llmAdapter'),
      promptFilter: container.resolve<PromptInjectionFilter>('promptFilter'),
      outputValidator: container.resolve<OutputValidator<AgentDecision>>('outputValidator'),
      permissionGate: container.resolve<ToolPermissionGate>('permissionGate'),
      auditLogger,
      tenantId, // P3: Propagate authenticated tenantId to audit logging
      requestId,
      dryRun: dryRun ?? false
    });

    const result = await agent.runOnce();

    // Return appropriate HTTP status codes based on agent result
    if (result.status === 'error') {
      // Client errors (4xx) vs server errors (5xx) based on error type
      const statusCode = result.error?.includes('Invalid') || result.error?.includes('not permitted')
        ? 400 // Bad request for validation/permission errors
        : 500; // Internal server error for other failures
      reply.code(statusCode).send(result);
      return;
    }

    if (result.status === 'idle') {
      reply.code(200).send(result);
      return;
    }

    if (result.status === 'dry_run') {
      reply.code(200).send(result);
      return;
    }

    // Success case (completed)
    reply.code(200).send(result);
  });

  return fastify;
}

if (require.main === module) {
  buildServer().then(async (fastify) => {
    // P3: Validate PORT to prevent NaN or invalid values
    // If env var is non-numeric, Number() returns NaN, which can cause Fastify to bind to unexpected port
    const portRaw = Number(process.env.PORT ?? 3000);
    if (!Number.isFinite(portRaw) || portRaw <= 0 || portRaw > 65535) {
      throw new Error(
        `Invalid PORT: ${process.env.PORT}. ` +
        `Must be a number between 1 and 65535. Got: ${portRaw}`
      );
    }
    const port = portRaw;
    
    // P3: Await and error-handle fastify.listen to prevent unhandled rejections
    try {
      await fastify.listen({ port, host: '0.0.0.0' });
      console.log(`Server listening on port ${port}`);
    } catch (error) {
      console.error(`[ERROR] Failed to start server on port ${port}:`, error);
      process.exit(1);
    }
  }).catch((error) => {
    console.error('[ERROR] Failed to build server:', error);
    process.exit(1);
  });
}
