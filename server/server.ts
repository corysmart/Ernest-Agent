import Fastify, { type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { buildContainer } from './container';
import { executeAgentRun } from './execute-agent-run';
import { assertSafeObject } from '../security/validation';
import { ObservabilityStore } from './observability-store';
import { registerObservabilityRoutes } from './observability-routes';

const conversationEntrySchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string()
});

const observationSchema = z.object({
  timestamp: z.number().optional(),
  state: z.record(z.unknown()),
  events: z.array(z.string()).optional(),
  /** Multi-turn context. Pass prior exchange for follow-ups (e.g. Codex asked a clarifying question). */
  conversation_history: z.array(conversationEntrySchema).optional()
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
  /** When true (or AUTO_RESPOND env), injects default "Respond to user" goal when user_message exists and no explicit goal. Disabled by default. */
  autoRespond: z.boolean().optional(),
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

const DEFAULT_RUN_ONCE_TIMEOUT_MS = 600_000; // 10 min, allows complex tasks when needed

function getRunOnceTimeoutMs(): number {
  const raw = Number(process.env.RUN_ONCE_TIMEOUT_MS ?? DEFAULT_RUN_ONCE_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_RUN_ONCE_TIMEOUT_MS;
  }
  return Math.floor(raw);
}

const DEFAULT_MAX_MULTI_ACT_STEPS = 10;

function getMaxMultiActSteps(): number {
  const raw = Number(process.env.MAX_MULTI_ACT_STEPS ?? DEFAULT_MAX_MULTI_ACT_STEPS);
  if (!Number.isFinite(raw) || raw < 1) {
    return 1;
  }
  return Math.min(50, Math.floor(raw)); // Cap at 50
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 300_000; // 5 min

function getHeartbeatIntervalMs(): number {
  const raw = Number(process.env.HEARTBEAT_INTERVAL_MS ?? DEFAULT_HEARTBEAT_INTERVAL_MS);
  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_HEARTBEAT_INTERVAL_MS;
  }
  return Math.floor(raw);
}

export async function buildServer(options?: { logger?: boolean }) {
  const requestTimeoutMs = getRunOnceTimeoutMs();
  const fastify = Fastify({
    logger: options?.logger ?? true,
    requestTimeout: requestTimeoutMs
  });
  const containerContext = await buildContainer();
  const { container, rateLimiter, toolRunner } = containerContext;
  
  let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  let heartbeatRunning = false;

  const heartbeatEnabled = process.env.HEARTBEAT_ENABLED === 'true' || process.env.HEARTBEAT_ENABLED === '1';

  if (heartbeatEnabled) {
    fastify.addHook('onReady', async () => {
      const intervalMs = getHeartbeatIntervalMs();
      heartbeatIntervalId = setInterval(async () => {
        if (heartbeatRunning) return;
        heartbeatRunning = true;
        const requestId = `heartbeat-${Date.now()}`;
        const goal = {
          id: requestId,
          title: 'Process heartbeat',
          horizon: 'short' as const,
          priority: 1
        };
        try {
          await executeAgentRun(container, toolRunner, obsStore, {
            observation: { timestamp: Date.now(), state: {} },
            goal,
            tenantId: undefined,
            requestId,
            dryRun: false,
            runTimeoutMs: getRunOnceTimeoutMs(),
            maxMultiActSteps: getMaxMultiActSteps()
          });
        } catch (err) {
          fastify.log?.error?.({ err }, 'Heartbeat run failed');
        } finally {
          heartbeatRunning = false;
        }
      }, intervalMs);
      fastify.log?.info?.({ intervalMs }, 'Heartbeat trigger started');
    });
  }

  // Register cleanup on server close
  fastify.addHook('onClose', async () => {
    if (heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId);
      heartbeatIntervalId = null;
    }
    await containerContext.cleanup();
  });

  fastify.addHook('onRequest', (request, reply, done) => {
    if (!rateLimiter.consume(request.ip, 1)) {
      reply.code(429).send({ error: 'Rate limit exceeded' });
      return;
    }
    done();
  });

  const obsUiEnabled = process.env.OBS_UI_ENABLED === 'true' || process.env.OBS_UI_ENABLED === '1'
    || (process.env.OBS_UI_ENABLED === undefined && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev'));
  const obsStore = obsUiEnabled ? new ObservabilityStore() : null;
  if (obsStore) {
    await registerObservabilityRoutes(fastify, obsStore);
  } else {
    fastify.get('/ui', async (_req, reply) => { reply.code(404).send({ error: 'UI disabled' }); });
    fastify.get('/ui/*', async (_req, reply) => { reply.code(404).send({ error: 'UI disabled' }); });
  }

  fastify.get('/health', async () => ({ status: 'ok' }));

  fastify.post('/agent/run-once', async (request, reply) => {
    assertSafeObject(request.body as Record<string, unknown>);
    const parsed = runOnceSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: parsed.error.issues.map((issue) => issue.message).join('; ') });
      return;
    }

    const { observation, goal, tenantId: clientTenantId, dryRun, autoRespond } = parsed.data;

    // Auto-inject default goal when user_message exists and no explicit goal.
    // Always inject for dry run with LLM (so the LLM always responds); otherwise require autoRespond.
    let effectiveGoal = goal;
    const userMessage = observation.state?.user_message;
    const hasUserMessage = typeof userMessage === 'string' && userMessage.trim().length > 0;
    const autoRespondEnabled = process.env.AUTO_RESPOND === 'true' || autoRespond === true;
    const dryRunWithLlm = dryRun === 'with-llm';
    if (!effectiveGoal && hasUserMessage && (autoRespondEnabled || dryRunWithLlm)) {
      effectiveGoal = {
        id: `respond-${Date.now()}`,
        title: 'Respond to user',
        horizon: 'short',
        priority: 1
      };
    }

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
    const runStartMs = Date.now();
    const requestId = `req-${runStartMs}-${Math.random().toString(36).substring(7)}`;
    
    let runResult;
    try {
      runResult = await executeAgentRun(container, toolRunner, obsStore, {
        observation: {
          timestamp: observation.timestamp,
          state: observation.state ?? {},
          events: observation.events,
          conversation_history: observation.conversation_history
        },
        goal: effectiveGoal,
        tenantId,
        requestId,
        dryRun: dryRun ?? false,
        runTimeoutMs: getRunOnceTimeoutMs(),
        maxMultiActSteps: getMaxMultiActSteps()
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('Goal conflict')) {
        reply.code(409).send({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message.includes('timed out')) {
        reply.code(504).send({
          status: 'error',
          error: err.message,
          stateTrace: []
        });
        return;
      }
      throw err;
    }

    const { result, durationMs } = runResult;
    const response = { ...result, durationMs };

    // Return appropriate HTTP status codes based on agent result
    if (result.status === 'error') {
      // Client errors (4xx) vs server errors (5xx) based on error type
      const statusCode = result.error?.includes('Invalid') || result.error?.includes('not permitted')
        ? 400 // Bad request for validation/permission errors
        : 500; // Internal server error for other failures
      reply.code(statusCode).send(response);
      return;
    }

    if (result.status === 'idle') {
      reply.code(200).send(response);
      return;
    }

    if (result.status === 'dry_run') {
      reply.code(200).send(response);
      return;
    }

    // Success case (completed)
    reply.code(200).send(response);
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
    
    const obsEnabled = process.env.OBS_UI_ENABLED === 'true' || process.env.OBS_UI_ENABLED === '1'
      || (process.env.OBS_UI_ENABLED === undefined && (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev'));
    const skipAuth = process.env.OBS_UI_SKIP_AUTH === 'true' || process.env.OBS_UI_SKIP_AUTH === '1';
    const forceLocalhost = skipAuth || (obsEnabled && process.env.OBS_UI_BIND_LOCALHOST !== 'false');
    const host = forceLocalhost ? '127.0.0.1' : '0.0.0.0';
    try {
      await fastify.listen({ port, host });
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
