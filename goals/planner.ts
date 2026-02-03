import type { AgentAction } from '../env/types';
import type { WorldModel } from '../world/world-model';
import type { Goal, Plan, PlanStep } from './types';
import type { SelfModelSnapshot } from '../self/types';
import type { WorldState } from '../world/types';
import { randomUUID } from 'crypto';

export interface PlanningContext {
  worldState: WorldState;
  self: SelfModelSnapshot;
  candidateActions: AgentAction[];
}

export interface Planner {
  plan(goal: Goal, context: PlanningContext): Plan;
}

export class HeuristicPlanner implements Planner {
  constructor(private readonly worldModel: WorldModel) {}

  plan(goal: Goal, context: PlanningContext): Plan {
    if (!context.candidateActions.length) {
      throw new Error('No candidate actions provided');
    }

    context.candidateActions.forEach((action) => validateAction(action));

    let bestAction: AgentAction | null = null;
    let bestScore = -Infinity;

    for (const action of context.candidateActions) {
      const prediction = this.worldModel.simulate(context.worldState, action);
      if (prediction.score > bestScore) {
        bestScore = prediction.score;
        bestAction = action;
      }
    }

    const selected = bestAction ?? context.candidateActions[0];
    if (!selected) {
      throw new Error('No candidate actions available');
    }
    const steps: PlanStep[] = [
      {
        id: randomUUID(),
        description: `Execute ${selected.type} for goal ${goal.title}`,
        action: { type: selected.type, payload: selected.payload },
        expectedScore: bestScore
      }
    ];

    return {
      id: randomUUID(),
      goalId: goal.id,
      createdAt: Date.now(),
      steps
    };
  }
}

function validateAction(action: AgentAction): void {
  if (!action.type) {
    throw new Error('Invalid action');
  }
}
