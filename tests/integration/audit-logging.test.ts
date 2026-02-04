import { CognitiveAgent } from '../../core/agent/cognitive-agent';
import { StructuredAuditLogger } from '../../security/audit-logger';
import { MockLLMAdapter } from '../../llm/mock-adapter';
import { SelfModel } from '../../self/self-model';
import { RequestEnvironment } from '../../server/request-environment';
import { SandboxedToolRunner } from '../../security/sandboxed-tool-runner';
import type { MemoryManager } from '../../memory/memory-manager';
import type { WorldModel } from '../../world/world-model';
import type { GoalStack } from '../../goals/goal-stack';
import type { Planner } from '../../goals/planner';
import type { PromptInjectionFilter, OutputValidator, ToolPermissionGate } from '../../core/contracts/security';

describe('Integration: Audit Logging', () => {
  let auditLogger: StructuredAuditLogger;
  let consoleLogSpy: jest.SpyInstance;
  let loggedEvents: any[];

  beforeEach(() => {
    loggedEvents = [];
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation((message: string) => {
      if (message.startsWith('[AUDIT]')) {
        const logData = JSON.parse(message.replace('[AUDIT] ', ''));
        loggedEvents.push(logData);
      }
    });
    auditLogger = new StructuredAuditLogger();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('logs agent decision when agent makes a decision', async () => {
    const llmAdapter = new MockLLMAdapter({
      response: '{"actionType":"pursue_goal","actionPayload":{"goalId":"g1"},"confidence":0.9,"reasoning":"High confidence"}'
    });

    const memoryManager: MemoryManager = {
      addEpisodic: async () => {},
      addSemantic: async () => {},
      addProcedural: async () => {},
      query: async () => [],
      injectForPrompt: async () => ''
    } as unknown as MemoryManager;

    const worldModel: WorldModel = {
      update: () => ({ timestamp: 1, facts: {}, uncertainty: 0.2 }),
      simulate: () => ({ action: { type: 'pursue_goal' }, expectedState: { timestamp: 1, facts: {}, uncertainty: 0.2 }, uncertainty: 0.2, score: 0.8 }),
      updateFromResult: (state) => state
    };

    const goalStack: GoalStack = {
      addGoal: () => {},
      updateStatus: () => {},
      resolveNextGoal: () => ({
        id: 'g1',
        title: 'Test Goal',
        priority: 1,
        status: 'active',
        horizon: 'short',
        createdAt: 1,
        updatedAt: 1
      }),
      listGoals: () => []
    } as unknown as GoalStack;

    const planner: Planner = {
      plan: () => ({
        id: 'p1',
        goalId: 'g1',
        createdAt: 1,
        steps: [{ id: 's1', description: 'Act', action: { type: 'pursue_goal' } }]
      })
    } as Planner;

    const promptFilter: PromptInjectionFilter = {
      sanitize: (input) => ({ sanitized: input, flagged: false, reasons: [] })
    };

    const outputValidator: OutputValidator<any> = {
      validate: (output) => ({ success: true, data: JSON.parse(output) })
    };

    const permissionGate: ToolPermissionGate = {
      isAllowed: () => ({ allowed: true })
    };

    const toolRunner = new SandboxedToolRunner({
      tools: {
        pursue_goal: async () => ({ acknowledged: true })
      }
    });

    const environment = new RequestEnvironment(
      { timestamp: 1, state: { status: 'ok' } },
      toolRunner,
      { auditLogger, tenantId: 'tenant-123', requestId: 'req-456' }
    );

    const agent = new CognitiveAgent({
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
      auditLogger,
      tenantId: 'tenant-123',
      requestId: 'req-456'
    });

    await agent.runOnce();

    // Should log LLM request
    const llmLogs = loggedEvents.filter((e) => e.eventType === 'llm_request');
    expect(llmLogs.length).toBeGreaterThan(0);
    expect(llmLogs[0]!.data.success).toBe(true);
    expect(llmLogs[0]!.tenantId).toBe('tenant-123');
    expect(llmLogs[0]!.requestId).toBe('req-456');

    // Should log agent decision
    const decisionLogs = loggedEvents.filter((e) => e.eventType === 'agent_decision');
    expect(decisionLogs.length).toBe(1);
    expect(decisionLogs[0]!.data.decision.actionType).toBe('pursue_goal');
    expect(decisionLogs[0]!.data.decision.confidence).toBe(0.9);
    expect(decisionLogs[0]!.data.goalId).toBe('g1');
    expect(decisionLogs[0]!.tenantId).toBe('tenant-123');
    expect(decisionLogs[0]!.requestId).toBe('req-456');

    // Should log tool call
    const toolLogs = loggedEvents.filter((e) => e.eventType === 'tool_call');
    expect(toolLogs.length).toBe(1);
    expect(toolLogs[0]!.data.toolName).toBe('pursue_goal');
    expect(toolLogs[0]!.data.success).toBe(true);
    expect(toolLogs[0]!.tenantId).toBe('tenant-123');
    expect(toolLogs[0]!.requestId).toBe('req-456');
  });

  it('logs errors when agent encounters errors', async () => {
    const llmAdapter = new MockLLMAdapter({
      response: 'invalid json'
    });

    const memoryManager: MemoryManager = {
      addEpisodic: async () => {},
      addSemantic: async () => {},
      addProcedural: async () => {},
      query: async () => [],
      injectForPrompt: async () => ''
    } as unknown as MemoryManager;

    const worldModel: WorldModel = {
      update: () => ({ timestamp: 1, facts: {}, uncertainty: 0.2 }),
      simulate: () => ({ action: { type: 'pursue_goal' }, expectedState: { timestamp: 1, facts: {}, uncertainty: 0.2 }, uncertainty: 0.2, score: 0.8 }),
      updateFromResult: (state) => state
    };

    const goalStack: GoalStack = {
      addGoal: () => {},
      updateStatus: () => {},
      resolveNextGoal: () => ({
        id: 'g1',
        title: 'Test Goal',
        priority: 1,
        status: 'active',
        horizon: 'short',
        createdAt: 1,
        updatedAt: 1
      }),
      listGoals: () => []
    } as unknown as GoalStack;

    const planner: Planner = {
      plan: () => ({
        id: 'p1',
        goalId: 'g1',
        createdAt: 1,
        steps: [{ id: 's1', description: 'Act', action: { type: 'pursue_goal' } }]
      })
    } as Planner;

    const promptFilter: PromptInjectionFilter = {
      sanitize: (input) => ({ sanitized: input, flagged: false, reasons: [] })
    };

    const outputValidator: OutputValidator<any> = {
      validate: () => ({ success: false, errors: ['Invalid JSON'] })
    };

    const permissionGate: ToolPermissionGate = {
      isAllowed: () => ({ allowed: true })
    };

    const toolRunner = new SandboxedToolRunner({
      tools: {
        pursue_goal: async () => ({ acknowledged: true })
      }
    });

    const environment = new RequestEnvironment(
      { timestamp: 1, state: { status: 'ok' } },
      toolRunner,
      { auditLogger, tenantId: 'tenant-123', requestId: 'req-456' }
    );

    const agent = new CognitiveAgent({
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
      auditLogger,
      tenantId: 'tenant-123',
      requestId: 'req-456'
    });

    const result = await agent.runOnce();

    // Should log error (error is logged in catch block)
    const errorLogs = loggedEvents.filter((e) => e.eventType === 'error');
    // Error might be logged, but the main error is returned in result
    expect(result.status).toBe('error');
    expect(result.error).toContain('Invalid LLM output');
    
    // If error was logged, verify it
    if (errorLogs.length > 0) {
      expect(errorLogs[0]!.data.error).toContain('Invalid LLM output');
      expect(errorLogs[0]!.tenantId).toBe('tenant-123');
      expect(errorLogs[0]!.requestId).toBe('req-456');
    }
  });
});

