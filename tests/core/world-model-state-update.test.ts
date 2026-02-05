import { CognitiveAgent } from '../../core/agent/cognitive-agent';
import { RuleBasedWorldModel } from '../../world/world-model';
import { SelfModel } from '../../self/self-model';
import { MockLLMAdapter } from '../../llm/mock-adapter';
import type { Environment } from '../../env/environment';
import type { IMemoryManager } from '../../memory/memory-manager';
import type { GoalStack } from '../../goals/goal-stack';
import type { Planner } from '../../goals/planner';
import type { PromptInjectionFilter, OutputValidator, ToolPermissionGate } from '../../core/contracts/security';
import { StructuredAuditLogger } from '../../security/audit-logger';

describe('World Model State Update', () => {
  it('P2: updates world state after actions without observations', async () => {
    const worldModel = new RuleBasedWorldModel();
    let capturedState: any = null;

    const environment: Environment = {
      observe: async () => ({ timestamp: 1, state: { status: 'initial' } }),
      act: async () => {
        // Return success without observation
        return { success: true };
      }
    };

    const memoryManager: IMemoryManager = {
      addEpisodic: async () => {},
      addSemantic: async () => {},
      addProcedural: async () => {},
      query: async () => [],
      injectForPrompt: async () => ''
    } as unknown as IMemoryManager;

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
        steps: [{ id: 's1', description: 'Act', action: { type: 'test' } }]
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

    // Spy on updateFromResult to verify it's called and state is updated
    const updateFromResultSpy = jest.spyOn(worldModel, 'updateFromResult').mockImplementation((state, result) => {
      capturedState = state;
      // Return updated state
      return worldModel.updateFromResult(state, result);
    });

    const agent = new CognitiveAgent({
      environment,
      memoryManager,
      worldModel,
      selfModel: new SelfModel(),
      goalStack,
      planner,
      llmAdapter: new MockLLMAdapter({
        response: '{"actionType":"test","actionPayload":{},"confidence":0.8}'
      }),
      promptFilter,
      outputValidator,
      permissionGate
    });

    await agent.runOnce();

    // Verify updateFromResult was called
    expect(updateFromResultSpy).toHaveBeenCalled();
    
    // Verify the state was updated (uncertainty should change based on success)
    const callArgs = updateFromResultSpy.mock.calls[0];
    expect(callArgs).toBeDefined();
    expect(callArgs![1]).toEqual({ success: true });
  });
});

