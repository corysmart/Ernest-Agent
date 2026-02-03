import { HeuristicPlanner } from '../../goals/planner';
import type { Goal } from '../../goals/types';
import type { AgentAction } from '../../env/types';
import type { WorldModel } from '../../world/world-model';

const goal: Goal = {
  id: 'g1',
  title: 'Stabilize system',
  priority: 5,
  status: 'active',
  horizon: 'short',
  createdAt: 1,
  updatedAt: 1
};

describe('HeuristicPlanner', () => {
  it('selects the action with the best simulated score', () => {
    const worldModel: WorldModel = {
      update: (obs) => ({ timestamp: obs.timestamp, facts: obs.state, uncertainty: 0.2 }),
      simulate: (_state, action) => ({
        action,
        expectedState: { timestamp: Date.now(), facts: { ok: true }, uncertainty: 0.2 },
        uncertainty: action.type === 'good' ? 0.1 : 0.8,
        score: action.type === 'good' ? 0.9 : 0.2
      }),
      updateFromResult: (state) => state
    };

    const planner = new HeuristicPlanner(worldModel);
    const actions: AgentAction[] = [{ type: 'bad' }, { type: 'good' }];

    const plan = planner.plan(goal, {
      worldState: { timestamp: 1, facts: { status: 'x' }, uncertainty: 0.3 },
      self: { capabilities: [], tools: [], reliability: 0.8, confidence: 0.7, failures: 0, successes: 1 },
      candidateActions: actions
    });

    expect(plan.steps[0].action.type).toBe('good');
  });

  it('rejects missing candidate actions', () => {
    const worldModel: WorldModel = {
      update: (obs) => ({ timestamp: obs.timestamp, facts: obs.state, uncertainty: 0.2 }),
      simulate: (_state, action) => ({
        action,
        expectedState: { timestamp: Date.now(), facts: {}, uncertainty: 0.2 },
        uncertainty: 0.5,
        score: 0.5
      }),
      updateFromResult: (state) => state
    };

    const planner = new HeuristicPlanner(worldModel);

    expect(() => planner.plan(goal, {
      worldState: { timestamp: 1, facts: { status: 'x' }, uncertainty: 0.3 },
      self: { capabilities: [], tools: [], reliability: 0.8, confidence: 0.7, failures: 0, successes: 1 },
      candidateActions: []
    })).toThrow('No candidate actions provided');
  });

  it('rejects invalid action descriptors', () => {
    const worldModel: WorldModel = {
      update: (obs) => ({ timestamp: obs.timestamp, facts: obs.state, uncertainty: 0.2 }),
      simulate: (_state, action) => ({
        action,
        expectedState: { timestamp: Date.now(), facts: {}, uncertainty: 0.2 },
        uncertainty: 0.5,
        score: 0.5
      }),
      updateFromResult: (state) => state
    };

    const planner = new HeuristicPlanner(worldModel);
    const actions: AgentAction[] = [{ type: '' }];

    expect(() => planner.plan(goal, {
      worldState: { timestamp: 1, facts: {}, uncertainty: 0.3 },
      self: { capabilities: [], tools: [], reliability: 0.8, confidence: 0.7, failures: 0, successes: 1 },
      candidateActions: actions
    })).toThrow('Invalid action');
  });
});
