import { CognitiveAgent } from '../../core/agent/cognitive-agent';
import type { Environment } from '../../env/environment';
import type { MemoryManager } from '../../memory/memory-manager';
import type { WorldModel } from '../../world/world-model';
import type { GoalStack } from '../../goals/goal-stack';
import type { Planner } from '../../goals/planner';
import type { LLMAdapter } from '../../core/contracts/llm';
import type { PromptInjectionFilter, OutputValidator, ToolPermissionGate } from '../../core/contracts/security';
import { StructuredAuditLogger } from '../../security/audit-logger';
import type { StructuredAuditLogger as StructuredAuditLoggerType } from '../../security/audit-logger';
import { SelfModel } from '../../self/self-model';

const observation = { timestamp: 1, state: { status: 'ok' } };

function buildAgent(overrides: Partial<{
  environment: Environment;
  memoryManager: MemoryManager;
  worldModel: WorldModel;
  goalStack: GoalStack;
  planner: Planner;
  llmAdapter: LLMAdapter;
  promptFilter: PromptInjectionFilter;
  outputValidator: OutputValidator<any>;
  permissionGate: ToolPermissionGate;
  auditLogger?: StructuredAuditLoggerType;
  tenantId?: string;
  requestId?: string;
  dryRun?: false | 'with-llm' | 'without-llm';
}> = {}) {
  const environment: Environment = overrides.environment ?? {
    observe: async () => observation,
    act: async () => ({ success: true })
  };

  const memoryManager: MemoryManager = overrides.memoryManager ?? ({
    addEpisodic: async () => {},
    addSemantic: async () => {},
    addProcedural: async () => {},
    query: async () => [],
    injectForPrompt: async () => 'memory'
  } as unknown as MemoryManager);

  const worldModel: WorldModel = overrides.worldModel ?? {
    update: () => ({ timestamp: 1, facts: { status: 'ok' }, uncertainty: 0.2 }),
    simulate: (state, action) => ({ action, expectedState: state, uncertainty: 0.2, score: 0.8 }),
    updateFromResult: (state) => state
  };

  const goalStack: GoalStack = overrides.goalStack ?? ({
    addGoal: () => {},
    updateStatus: () => {},
    resolveNextGoal: () => ({
      id: 'g1',
      title: 'Recover',
      priority: 5,
      status: 'active',
      horizon: 'short',
      createdAt: 1,
      updatedAt: 1
    }),
    listGoals: () => []
  } as unknown as GoalStack);

  const planner: Planner = overrides.planner ?? {
    plan: () => ({
      id: 'p1',
      goalId: 'g1',
      createdAt: 1,
      steps: [{ id: 's1', description: 'Act', action: { type: 'recover' } }]
    })
  } as Planner;

  const llmAdapter: LLMAdapter = overrides.llmAdapter ?? {
    generate: async () => ({ content: '{"actionType":"recover","actionPayload":{},"confidence":0.8}', tokensUsed: 10 }),
    embed: async () => [1, 0],
    estimateCost: () => 0
  };

  const promptFilter: PromptInjectionFilter = overrides.promptFilter ?? {
    sanitize: (input: string) => ({ sanitized: input, flagged: false, reasons: [] })
  };

  const outputValidator: OutputValidator<any> = overrides.outputValidator ?? {
    validate: (output: string) => ({ success: true, data: JSON.parse(output) })
  };

  const permissionGate: ToolPermissionGate = overrides.permissionGate ?? {
    isAllowed: () => ({ allowed: true })
  };

  return new CognitiveAgent({
    environment,
    memoryManager,
    worldModel,
    selfModel: new SelfModel(),
    goalStack,
    planner,
    llmAdapter,
    promptFilter,
    outputValidator,
    permissionGate,
    auditLogger: overrides.auditLogger,
    tenantId: overrides.tenantId,
    requestId: overrides.requestId,
    dryRun: overrides.dryRun
  });
}

describe('CognitiveAgent', () => {
  it('runs one loop and acts on validated decision', async () => {
    const agent = buildAgent();

    const result = await agent.runOnce();

    expect(result.status).toBe('completed');
    expect(result.decision?.actionType).toBe('recover');
    expect(result.actionResult?.success).toBe(true);
  });

  it('blocks invalid LLM output', async () => {
    const agent = buildAgent({
      outputValidator: { validate: () => ({ success: false, errors: ['invalid'] }) }
    });

    const result = await agent.runOnce();

    expect(result.status).toBe('error');
    expect(result.error).toContain('invalid');
  });

  it('sanitizes prompt inputs', async () => {
    let sanitizedInput = '';
    const agent = buildAgent({
      promptFilter: {
        sanitize: (input: string) => {
          sanitizedInput = input.replace('attack', '');
          return { sanitized: sanitizedInput, flagged: false, reasons: [] };
        }
      },
      environment: {
        observe: async () => ({ timestamp: 1, state: { status: 'attack' } }),
        act: async () => ({ success: true })
      }
    });

    await agent.runOnce();

    expect(sanitizedInput).not.toContain('attack');
  });

  it('P3: blocks execution when prompt injection is detected', async () => {
    const loggedErrors: any[] = [];
    const auditLogger = new StructuredAuditLogger();
    const logErrorSpy = jest.spyOn(auditLogger, 'logError').mockImplementation(async (params: any) => {
      loggedErrors.push(params);
    });
    
    const agent = buildAgent({
      promptFilter: {
        sanitize: (input: string) => ({
          sanitized: input,
          flagged: true,
          reasons: ['suspicious-pattern', 'injection-attempt']
        })
      },
      auditLogger
    });

    const result = await agent.runOnce();

    expect(result.status).toBe('error');
    expect(result.error).toContain('Prompt injection detected');
    expect(loggedErrors).toHaveLength(1);
    expect(loggedErrors[0]!.error).toBe('Prompt injection detected');
    expect(loggedErrors[0]!.context.reasons).toEqual(['suspicious-pattern', 'injection-attempt']);
    
    logErrorSpy.mockRestore();
  });

  it('dryRun with-llm: calls LLM, skips act and state updates', async () => {
    let actCalled = false;
    let addEpisodicCalled = false;
    const baseMemory = {
      addEpisodic: async () => { addEpisodicCalled = true; },
      addSemantic: async () => {},
      addProcedural: async () => {},
      query: async () => [],
      injectForPrompt: async () => 'memory'
    };
    const agent = buildAgent({
      dryRun: 'with-llm',
      environment: {
        observe: async () => observation,
        act: async () => {
          actCalled = true;
          return { success: true };
        }
      },
      memoryManager: baseMemory as unknown as MemoryManager
    });

    const result = await agent.runOnce();

    expect(result.status).toBe('dry_run');
    expect(result.dryRunMode).toBe('with-llm');
    expect(result.decision?.actionType).toBe('recover');
    expect(result.actionResult?.skipped).toBe(true);
    expect(actCalled).toBe(false);
    expect(addEpisodicCalled).toBe(false);
  });

  it('dryRun without-llm: skips LLM, uses stub decision, skips act', async () => {
    let llmCalled = false;
    let actCalled = false;
    const agent = buildAgent({
      dryRun: 'without-llm',
      llmAdapter: {
        generate: async () => {
          llmCalled = true;
          return { content: '{}', tokensUsed: 0 };
        },
        embed: async () => [],
        estimateCost: () => 0
      },
      environment: {
        observe: async () => observation,
        act: async () => {
          actCalled = true;
          return { success: true };
        }
      }
    });

    const result = await agent.runOnce();

    expect(result.status).toBe('dry_run');
    expect(result.dryRunMode).toBe('without-llm');
    expect(result.decision?.actionType).toBe('pursue_goal');
    expect(result.decision?.reasoning).toContain('Dry run');
    expect(result.actionResult?.skipped).toBe(true);
    expect(llmCalled).toBe(false);
    expect(actCalled).toBe(false);
  });
});
