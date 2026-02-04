import { GoalStack } from '../../goals/goal-stack';
import { HeuristicPlanner } from '../../goals/planner';
import { RuleBasedWorldModel } from '../../world/world-model';

describe('Integration: planning loop', () => {
  it('selects action with highest simulated score', () => {
    const goalStack = new GoalStack();
    goalStack.addGoal({
      id: 'g1',
      title: 'Reduce latency',
      priority: 5,
      status: 'active',
      horizon: 'short',
      createdAt: 1,
      updatedAt: 1,
      candidateActions: [
        { type: 'scale-up', payload: { nodes: 2 } },
        { type: 'restart-service' }
      ]
    });

    const worldModel = new RuleBasedWorldModel({
      predictors: [
        {
          canHandle: (action) => action.type === 'scale-up',
          predict: () => ({ score: 0.9, uncertainty: 0.2, facts: { scaled: true } })
        },
        {
          canHandle: (action) => action.type === 'restart-service',
          predict: () => ({ score: 0.4, uncertainty: 0.5, facts: { restarted: true } })
        }
      ]
    });

    const planner = new HeuristicPlanner(worldModel);
    const goal = goalStack.resolveNextGoal();
    if (!goal) {
      throw new Error('Goal missing');
    }

    const plan = planner.plan(goal, {
      worldState: worldModel.update({ timestamp: 1, state: { status: 'warn' } }),
      self: { capabilities: [], tools: [], reliability: 0.8, confidence: 0.7, failures: 0, successes: 1 },
      candidateActions: goal.candidateActions ?? []
    });

    expect(plan.steps[0]!.action.type).toBe('scale-up');
  });
});
