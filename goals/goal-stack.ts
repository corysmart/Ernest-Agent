import type { Goal, GoalStatus } from './types';

export class GoalStack {
  private readonly goals = new Map<string, Goal>();

  addGoal(goal: Goal): void {
    validateGoal(goal);
    if (this.goals.has(goal.id)) {
      throw new Error('Goal with id already exists');
    }
    this.goals.set(goal.id, { ...goal });
  }

  updateStatus(goalId: string, status: GoalStatus): void {
    const existing = this.goals.get(goalId);
    if (!existing) {
      return;
    }
    this.goals.set(goalId, { ...existing, status, updatedAt: Date.now() });
  }

  resolveNextGoal(): Goal | null {
    const candidates = [...this.goals.values()].filter((goal) => goal.status === 'active' || goal.status === 'pending');
    if (!candidates.length) {
      return null;
    }

    candidates.sort((a, b) => {
      const statusScore = (goal: Goal) => (goal.status === 'active' ? 1 : 0);
      if (statusScore(b) !== statusScore(a)) {
        return statusScore(b) - statusScore(a);
      }
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      if (a.horizon !== b.horizon) {
        return a.horizon === 'short' ? -1 : 1;
      }
      return a.createdAt - b.createdAt;
    });

    // P3: Return defensive copy to prevent external mutation of internal goal state
    const selectedGoal = candidates[0];
    if (!selectedGoal) {
      return null;
    }
    
    return {
      id: selectedGoal.id,
      title: selectedGoal.title,
      description: selectedGoal.description,
      priority: selectedGoal.priority,
      status: selectedGoal.status,
      horizon: selectedGoal.horizon,
      createdAt: selectedGoal.createdAt,
      updatedAt: selectedGoal.updatedAt,
      candidateActions: selectedGoal.candidateActions ? [...selectedGoal.candidateActions] : undefined
    };
  }

  listGoals(): Goal[] {
    // P3: Return defensive copies to prevent callers from mutating internal state
    // This preserves invariants and prevents external modification without validation
    return [...this.goals.values()].map((goal) => ({
      ...goal,
      // Deep copy candidateActions if present to prevent mutation
      candidateActions: goal.candidateActions?.map((action) => ({
        ...action,
        payload: action.payload ? JSON.parse(JSON.stringify(action.payload)) : undefined
      }))
    }));
  }
}

function validateGoal(goal: Goal): void {
  if (!goal.id || !goal.title || goal.priority < 0 || !Number.isFinite(goal.priority)) {
    throw new Error('Invalid goal');
  }

  if (!['pending', 'active', 'completed', 'failed', 'blocked'].includes(goal.status)) {
    throw new Error('Invalid goal');
  }

  if (!['short', 'long'].includes(goal.horizon)) {
    throw new Error('Invalid goal');
  }
}
