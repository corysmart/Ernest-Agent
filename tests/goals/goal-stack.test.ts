import { GoalStack } from '../../goals/goal-stack';
import type { Goal } from '../../goals/types';

describe('GoalStack', () => {
  it('returns highest priority active or pending goal', () => {
    const stack = new GoalStack();
    const goals: Goal[] = [
      { id: 'g1', title: 'Low', priority: 1, status: 'pending', horizon: 'long', createdAt: 1, updatedAt: 1 },
      { id: 'g2', title: 'High', priority: 5, status: 'active', horizon: 'short', createdAt: 2, updatedAt: 2 }
    ];

    goals.forEach((goal) => stack.addGoal(goal));

    const next = stack.resolveNextGoal();
    expect(next?.id).toBe('g2');
  });

  it('rejects duplicate goal ids', () => {
    const stack = new GoalStack();
    const goal: Goal = { id: 'dup', title: 'Goal', priority: 1, status: 'pending', horizon: 'short', createdAt: 1, updatedAt: 1 };

    stack.addGoal(goal);
    expect(() => stack.addGoal(goal)).toThrow('Goal with id already exists');
  });

  it('rejects invalid goal payloads', () => {
    const stack = new GoalStack();

    expect(() => stack.addGoal({
      id: '',
      title: '',
      priority: -1,
      status: 'pending',
      horizon: 'short',
      createdAt: 1,
      updatedAt: 1
    } as Goal)).toThrow('Invalid goal');
  });
});
