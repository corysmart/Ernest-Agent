import Fastify from 'fastify';
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
  tenantId: z.string().min(1).optional()
});

export async function buildServer() {
  const fastify = Fastify({ logger: true });
  const { container, rateLimiter, toolRunner } = await buildContainer();

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

    const { observation, goal, tenantId: clientTenantId } = parsed.data;
    
    // P2: Security: tenantId is client-controlled and unauthenticated.
    // Until authentication is implemented, reject client-supplied tenantId to prevent
    // cross-tenant data access. Use request-scoped IDs for anonymous requests only.
    // TODO: Once authentication is added, bind tenantId to authenticated principal.
    if (clientTenantId) {
      reply.code(403).send({ 
        error: 'Tenant ID authentication not yet implemented. Client-supplied tenantId is rejected for security.',
        hint: 'Remove tenantId from request or wait for authentication support'
      });
      return;
    }
    
    // Create scoped memory manager for tenant isolation
    // For anonymous requests, use request-scoped ID and skip persistence
    const baseMemoryManager = container.resolve<MemoryManager>('memoryManager');
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const persistMemory = false; // Always false until auth is implemented
    const scopedMemoryManager = new ScopedMemoryManager(baseMemoryManager, requestId, persistMemory);
    
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
      tenantId: undefined, // tenantId is undefined until auth is implemented
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
      tenantId: undefined, // tenantId is undefined until auth is implemented
      requestId
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
      // No goals to process - not an error, but might want to indicate no action taken
      reply.code(200).send(result);
      return;
    }

    // Success case
    reply.code(200).send(result);
  });

  return fastify;
}

if (require.main === module) {
  buildServer().then((fastify) => {
    const port = Number(process.env.PORT ?? 3000);
    fastify.listen({ port, host: '0.0.0.0' });
  });
}
