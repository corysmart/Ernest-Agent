import { CognitiveAgent } from '../../core/agent/cognitive-agent';
import { MockLLMAdapter } from '../../llm/mock-adapter';
import { SelfModel } from '../../self/self-model';
import type { Environment } from '../../env/environment';
import type { MemoryManager } from '../../memory/memory-manager';
import type { WorldModel } from '../../world/world-model';
import type { GoalStack } from '../../goals/goal-stack';
import type { Planner } from '../../goals/planner';
import type { OutputValidator, PromptInjectionFilter, ToolPermissionGate } from '../../core/contracts/security';

function buildAgent(adapter: MockLLMAdapter) {
  const environment: Environment = {
    observe: async () => ({ timestamp: 1, state: { status: 'ok' } }),
    act: async (action) => ({ success: true, outputs: { acted: action.type } })
  };

  const memoryManager: MemoryManager = {
    addEpisodic: async () => {},
    addSemantic: async () => {},
    addProcedural: async () => {},
    query: async () => [],
    injectForPrompt: async () => ''
  } as unknown as MemoryManager;

  const worldModel: WorldModel = {
    update: (obs) => ({ timestamp: obs.timestamp, facts: obs.state, uncertainty: 0.2 }),
    simulate: (state, action) => ({ action, expectedState: state, uncertainty: 0.2, score: 0.5 }),
    updateFromResult: (state) => state
  };

  const goalStack: GoalStack = {
    addGoal: () => {},
    updateStatus: () => {},
    resolveNextGoal: () => ({
      id: 'g1',
      title: 'Test',
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
      steps: [{ id: 's1', description: 'Act', action: { type: 'noop' } }]
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

  return new CognitiveAgent({
    environment,
    memoryManager,
    worldModel,
    selfModel: new SelfModel(),
    goalStack,
    planner,
    llmAdapter: adapter,
    promptFilter,
    outputValidator,
    permissionGate
  });
}

describe('Integration: model adapter swapping', () => {
  it('uses provided adapter without changing core logic', async () => {
    const adapterA = new MockLLMAdapter({ response: '{"actionType":"alpha","actionPayload":{},"confidence":0.8}' });
    const adapterB = new MockLLMAdapter({ response: '{"actionType":"beta","actionPayload":{},"confidence":0.8}' });

    const agentA = buildAgent(adapterA);
    const agentB = buildAgent(adapterB);

    const resultA = await agentA.runOnce();
    const resultB = await agentB.runOnce();

    expect(resultA.decision?.actionType).toBe('alpha');
    expect(resultB.decision?.actionType).toBe('beta');
  });
});
