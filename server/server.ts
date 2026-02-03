import Fastify from 'fastify';
import { z } from 'zod';
import { buildContainer } from './container';
import { CognitiveAgent } from '../core/agent/cognitive-agent';
import { RequestEnvironment } from './request-environment';
import { assertSafeObject } from '../security/validation';

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
  goal: goalSchema.optional()
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

    const { observation, goal } = parsed.data;
    const goalStack = container.resolve<import('../goals/goal-stack').GoalStack>('goalStack');
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
    }, toolRunner);

    const agent = new CognitiveAgent({
      environment,
      memoryManager: container.resolve<import('../memory/memory-manager').MemoryManager>('memoryManager'),
      worldModel: container.resolve<import('../world/world-model').WorldModel>('worldModel'),
      selfModel: container.resolve<import('../self/self-model').SelfModel>('selfModel'),
      goalStack,
      planner: container.resolve<import('../goals/planner').Planner>('planner'),
      llmAdapter: container.resolve<import('../core/contracts/llm').LLMAdapter>('llmAdapter'),
      promptFilter: container.resolve<import('../core/contracts/security').PromptInjectionFilter>('promptFilter'),
      outputValidator: container.resolve<import('../core/contracts/security').OutputValidator<import('../core/contracts/agent').AgentDecision>>('outputValidator'),
      permissionGate: container.resolve<import('../core/contracts/security').ToolPermissionGate>('permissionGate')
    });

    const result = await agent.runOnce();

    reply.send(result);
  });

  return fastify;
}

if (require.main === module) {
  buildServer().then((fastify) => {
    const port = Number(process.env.PORT ?? 3000);
    fastify.listen({ port, host: '0.0.0.0' });
  });
}
